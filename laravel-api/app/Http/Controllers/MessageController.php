<?php

namespace App\Http\Controllers;

use App\Models\CampaignMessage;
use App\Models\CampaignSeries;
use App\Services\TranslationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
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
     * Update a message (only if pending).
     */
    public function update(Request $request, int $seriesId, int $messageId): JsonResponse
    {
        $message = CampaignMessage::where('series_id', $seriesId)->findOrFail($messageId);

        if ($message->status !== 'pending') {
            return response()->json([
                'message' => 'Only pending messages can be updated.',
            ], 422);
        }

        $validated = $request->validate([
            'order_index'  => ['sometimes', 'integer', 'min:0'],
            'scheduled_at' => ['sometimes', 'date'],
        ]);

        $message->update($validated);

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
            $this->translationService->translateSeries($series, $validated['target_languages']);
        } catch (\Throwable $e) {
            return response()->json([
                'message' => 'Translation failed: ' . $e->getMessage(),
            ], 500);
        }

        return response()->json([
            'message'            => 'Translations completed.',
            'target_languages'   => $validated['target_languages'],
        ]);
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
}
