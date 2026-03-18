<?php

namespace App\Http\Controllers;

use App\Jobs\SendMessageJob;
use App\Models\CampaignMessage;
use App\Models\CampaignSeries;
use App\Models\Group;
use App\Models\SendLog;
use App\Services\TranslationService;
use GuzzleHttp\Client;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\Rule;

class MessageController extends Controller
{
    public function __construct(
        private readonly TranslationService $translationService
    ) {}

    /**
     * List messages for a series.
     */
    public function index(int $seriesId): JsonResponse
    {
        $series = CampaignSeries::findOrFail($seriesId);

        $messages = $series->messages()
            ->with(['translations', 'targets.group'])
            ->withCount('sendLogs')
            ->orderBy('order_index')
            ->get();

        return response()->json($messages);
    }

    /**
     * Create a new message for a series.
     */
    public function store(Request $request, int $seriesId): JsonResponse
    {
        $series = CampaignSeries::findOrFail($seriesId);

        $validated = $request->validate([
            'order_index'  => ['required', 'integer', 'min:0'],
            'scheduled_at' => ['required', 'date'],
            'translations' => ['nullable', 'array'],
            'translations.*.language'   => ['required', 'string', 'max:10'],
            'translations.*.content'    => ['required', 'string'],
            'translations.*.translated_by' => ['nullable', Rule::in(['manual', 'gpt4o'])],
        ]);

        $message = $series->messages()->create([
            'order_index'  => $validated['order_index'],
            'scheduled_at' => $validated['scheduled_at'],
            'status'       => 'pending',
        ]);

        if (! empty($validated['translations'])) {
            foreach ($validated['translations'] as $translation) {
                $message->translations()->create([
                    'language'       => $translation['language'],
                    'content'        => $translation['content'],
                    'translated_by'  => $translation['translated_by'] ?? 'manual',
                ]);
            }
        }

        return response()->json($message->load('translations'), 201);
    }

    /**
     * Update a message (only if pending or partially_sent — not yet fully sent).
     * Allows editing content, schedule, and translations even if the series is active.
     */
    public function update(Request $request, int $seriesId, int $messageId): JsonResponse
    {
        $message = CampaignMessage::where('series_id', $seriesId)->findOrFail($messageId);

        if (! in_array($message->status, ['pending', 'partially_sent'], true)) {
            return response()->json([
                'message' => 'Seuls les messages en attente peuvent être modifiés.',
            ], 422);
        }

        $validated = $request->validate([
            'order_index'  => ['sometimes', 'integer', 'min:0'],
            'scheduled_at' => ['sometimes', 'date'],
            'translations' => ['sometimes', 'array'],
            'translations.*.language'      => ['required', 'string', 'max:10'],
            'translations.*.content'       => ['required', 'string'],
            'translations.*.translated_by' => ['nullable', Rule::in(['manual', 'gpt4o'])],
        ]);

        $message->update(collect($validated)->only(['order_index', 'scheduled_at'])->toArray());

        // Update translations if provided
        if (isset($validated['translations'])) {
            foreach ($validated['translations'] as $t) {
                $message->translations()->updateOrCreate(
                    ['language' => $t['language']],
                    [
                        'content'       => $t['content'],
                        'translated_by' => $t['translated_by'] ?? 'manual',
                    ]
                );
            }
        }

        return response()->json($message->fresh('translations'));
    }

    /**
     * Delete a message (only if pending).
     */
    public function destroy(int $seriesId, int $messageId): JsonResponse
    {
        $message = CampaignMessage::where('series_id', $seriesId)->findOrFail($messageId);

        if ($message->status !== 'pending') {
            return response()->json([
                'message' => 'Only pending messages can be deleted.',
            ], 422);
        }

        $message->delete();

        return response()->json(['message' => 'Message deleted.']);
    }

    /**
     * Trigger auto-translation for all messages in a series.
     */
    public function translate(Request $request, int $seriesId): JsonResponse
    {
        $series = CampaignSeries::findOrFail($seriesId);

        $validated = $request->validate([
            'target_languages'   => ['required', 'array', 'min:1'],
            'target_languages.*' => ['required', 'string', 'max:10'],
        ]);

        try {
            $result = $this->translationService->translateSeries($series, $validated['target_languages']);
        } catch (\Throwable $e) {
            return response()->json([
                'message' => 'Translation failed: ' . $e->getMessage(),
            ], 500);
        }

        $response = [
            'message'            => $result['failed']
                ? 'Translations completed with some failures.'
                : 'Translations completed.',
            'target_languages'   => $validated['target_languages'],
            'succeeded'          => $result['succeeded'],
        ];

        if (! empty($result['failed'])) {
            $response['failed'] = $result['failed'];
        }

        return response()->json($response);
    }

    /**
     * Retrieve send logs for a specific message.
     */
    public function logs(int $seriesId, int $messageId): JsonResponse
    {
        $message = CampaignMessage::where('series_id', $seriesId)->findOrFail($messageId);

        $logs = $message->sendLogs()->with('group:id,name,language,whatsapp_group_id')->get();

        return response()->json($logs);
    }

    /**
     * Force-send a partially_sent or pending message immediately,
     * bypassing the daily quota wait (carry-over).
     */
    public function forceSend(int $seriesId, int $messageId): JsonResponse
    {
        $message = CampaignMessage::where('series_id', $seriesId)->findOrFail($messageId);

        if (! in_array($message->status, ['partially_sent', 'pending'], true)) {
            return response()->json([
                'message' => 'Seuls les messages en attente ou partiellement envoyés peuvent être forcés.',
            ], 422);
        }

        $series = $message->series;
        if (in_array($series->status, ['draft', 'paused', 'failed', 'completed'], true)) {
            return response()->json([
                'message' => 'La série doit être active ou planifiée pour forcer un envoi.',
            ], 422);
        }

        DB::transaction(function () use ($message) {
            // Remove quota_exceeded logs so buildTargets sees them as unsent
            $deleted = SendLog::where('message_id', $message->id)
                ->where('status', 'quota_exceeded')
                ->delete();

            $message->update(['status' => 'sending']);

            Log::info("MessageController::forceSend — message #{$message->id} force-dispatched, {$deleted} quota_exceeded logs cleared.");
        });

        dispatch(new SendMessageJob($message->id));

        return response()->json([
            'message' => 'Message forcé en envoi immédiat.',
            'message_id' => $message->id,
        ]);
    }

    /**
     * Resend a message to a specific group via Baileys /send/test.
     * Works for any message status — uses the translation content directly.
     * Replaces existing send_log for that group (deletes old, creates new).
     */
    public function resendToGroup(Request $request, int $seriesId, int $messageId): JsonResponse
    {
        $validated = $request->validate([
            'group_id' => ['required', 'integer', 'exists:groups,id'],
        ]);

        $message = CampaignMessage::where('series_id', $seriesId)
            ->with('translations')
            ->findOrFail($messageId);

        $group = Group::with('whatsappNumber')->findOrFail($validated['group_id']);

        // Find content for this group's language
        $translation = $message->translations->firstWhere('language', $group->language);
        if (! $translation) {
            $series = $message->series;
            if ($series->source_language) {
                $translation = $message->translations->firstWhere('language', $series->source_language);
            }
        }
        if (! $translation) {
            $translation = $message->translations->first();
        }

        if (! $translation) {
            return response()->json(['message' => 'Aucune traduction disponible pour ce message.'], 422);
        }

        // Send via Baileys /send/test
        $baileysUrl = config('baileys.service_url');
        $baileysKey = config('baileys.api_key');
        $client = new Client(['timeout' => 15]);

        try {
            $response = $client->post("{$baileysUrl}/send/test", [
                'headers' => [
                    'X-API-Key'    => $baileysKey,
                    'Content-Type' => 'application/json',
                ],
                'json' => [
                    'group_wa_id'   => $group->whatsapp_group_id,
                    'content'       => $translation->content,
                    'instance_slug' => $group->whatsappNumber?->slug,
                ],
            ]);

            $result = json_decode($response->getBody()->getContents(), true);

            if (! ($result['success'] ?? false)) {
                return response()->json([
                    'message' => 'Baileys a refusé l\'envoi : ' . ($result['error'] ?? 'unknown'),
                ], 502);
            }
        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Erreur d\'envoi Baileys : ' . $e->getMessage(),
            ], 502);
        }

        // Delete old send_log for this group+message and create a new one
        SendLog::where('message_id', $message->id)
            ->where('group_id', $group->id)
            ->delete();

        SendLog::create([
            'message_id'         => $message->id,
            'group_id'           => $group->id,
            'language'           => $translation->language,
            'content_sent'       => $translation->content,
            'status'             => 'sent',
            'sent_at'            => now(),
            'error_message'      => null,
            'whatsapp_number_id' => $group->whatsappNumber?->id,
        ]);

        Log::info("MessageController::resendToGroup — message #{$message->id} resent to group #{$group->id} ({$group->name})");

        return response()->json([
            'message' => "Message renvoyé à {$group->name}",
            'group_id' => $group->id,
        ]);
    }
}
