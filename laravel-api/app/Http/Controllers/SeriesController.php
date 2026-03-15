<?php

namespace App\Http\Controllers;

use App\Jobs\SendMessageJob;
use App\Models\CampaignMessage;
use App\Models\CampaignSeries;
use App\Services\SchedulerService;
use GuzzleHttp\Client;
use GuzzleHttp\Exception\RequestException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\Rule;

class SeriesController extends Controller
{
    public function __construct(
        private readonly SchedulerService $scheduler
    ) {}

    /**
     * List all series, paginated.
     */
    public function index(Request $request): JsonResponse
    {
        $request->validate(['per_page' => 'nullable|integer|min:1|max:100']);

        $series = CampaignSeries::with([
            'createdBy:id,name',
            'messages' => fn ($q) => $q->withCount('sendLogs'),
        ])
            ->latest()
            ->paginate($request->input('per_page', 30));

        return response()->json($series);
    }

    /**
     * Create a new series.
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name'             => ['required', 'string', 'max:255'],
            'type'             => ['required', Rule::in(['drip', 'one_shot'])],
            'targeting_mode'   => ['required', Rule::in(['by_language', 'by_group', 'hybrid'])],
            'target_languages' => ['nullable', 'array'],
            'target_languages.*' => ['string', Rule::in(['fr', 'en', 'de', 'pt', 'es', 'it', 'nl', 'ar', 'zh', 'hi', 'ru'])],
            'target_categories' => ['nullable', 'array'],
            'target_categories.*' => ['string', Rule::in(['chatter', 'client', 'avocat', 'blogger', 'influencer', 'group_admin', 'expatrie_aidant'])],
            'target_groups'    => ['nullable', 'array'],
            'target_groups.*'  => ['integer', 'exists:groups,id'],
            'send_days'        => ['nullable', 'array'],
            'send_days.*'      => ['string', Rule::in(['monday','tuesday','wednesday','thursday','friday','saturday','sunday'])],
            'send_time'        => ['nullable', 'regex:/^\d{2}:\d{2}(:\d{2})?$/'],
            'timezone'         => ['nullable', 'timezone'],
            'starts_at'        => ['required', 'date'],
            'ends_at'          => ['nullable', 'date', 'after_or_equal:starts_at'],
            'translation_mode' => ['nullable', Rule::in(['auto', 'manual'])],
            'source_language'  => ['nullable', 'string', 'max:10'],
            'notes'            => ['nullable', 'string'],
        ]);

        // Derive messages_per_week from send_days
        if (! empty($validated['send_days'])) {
            $validated['messages_per_week'] = count($validated['send_days']);
        }

        $validated['created_by'] = $request->user()->id;

        $series = CampaignSeries::create($validated);

        // Save group targets for by_group and hybrid modes
        if (in_array($validated['targeting_mode'], ['by_group', 'hybrid'], true) && !empty($request->input('target_groups'))) {
            $groupIds = array_unique((array) $request->input('target_groups'));
            foreach ($groupIds as $groupId) {
                \App\Models\SeriesTarget::create([
                    'series_id' => $series->id,
                    'group_id'  => (int) $groupId,
                ]);
            }
        }

        return response()->json($series->load('createdBy:id,name'), 201);
    }

    /**
     * Show a single series with all related data.
     */
    public function show(int $id): JsonResponse
    {
        $series = CampaignSeries::with([
            'messages.translations',
            'messages.targets.group',
            'seriesTargets.group',
            'createdBy:id,name',
        ])->findOrFail($id);

        return response()->json($series);
    }

    /**
     * Update a series (only when in draft status).
     */
    public function update(Request $request, int $id): JsonResponse
    {
        $series = CampaignSeries::findOrFail($id);

        if ($series->status !== 'draft') {
            return response()->json([
                'message' => 'Only draft series can be updated.',
            ], 422);
        }

        $validated = $request->validate([
            'name'             => ['sometimes', 'string', 'max:255'],
            'type'             => ['sometimes', Rule::in(['drip', 'one_shot'])],
            'targeting_mode'   => ['sometimes', Rule::in(['by_language', 'by_group', 'hybrid'])],
            'target_languages' => ['nullable', 'array'],
            'target_languages.*' => ['string', Rule::in(['fr', 'en', 'de', 'pt', 'es', 'it', 'nl', 'ar', 'zh', 'hi', 'ru'])],
            'target_categories' => ['nullable', 'array'],
            'target_categories.*' => ['string', Rule::in(['chatter', 'client', 'avocat', 'blogger', 'influencer', 'group_admin', 'expatrie_aidant'])],
            'send_days'        => ['nullable', 'array'],
            'send_days.*'      => ['string', Rule::in(['monday','tuesday','wednesday','thursday','friday','saturday','sunday'])],
            'send_time'        => ['nullable', 'regex:/^\d{2}:\d{2}(:\d{2})?$/'],
            'timezone'         => ['nullable', 'timezone'],
            'starts_at'        => ['sometimes', 'date'],
            'ends_at'          => ['nullable', 'date', 'after_or_equal:starts_at'],
            'translation_mode' => ['nullable', Rule::in(['auto', 'manual'])],
            'source_language'  => ['nullable', 'string', 'max:10'],
            'notes'            => ['nullable', 'string'],
        ]);

        if (isset($validated['send_days'])) {
            $validated['messages_per_week'] = count($validated['send_days']);
        }

        $series->update($validated);

        return response()->json($series->fresh('createdBy:id,name'));
    }

    /**
     * Delete a series (only when in draft status).
     */
    public function destroy(int $id): JsonResponse
    {
        $series = CampaignSeries::findOrFail($id);

        if ($series->status !== 'draft') {
            return response()->json([
                'message' => 'Only draft series can be deleted.',
            ], 422);
        }

        $series->delete();

        return response()->json(['message' => 'Series deleted.']);
    }

    /**
     * Schedule a series: calculate message slots and create CampaignMessage records.
     */
    public function schedule(Request $request, int $id): JsonResponse
    {
        $series = CampaignSeries::findOrFail($id);

        if (! in_array($series->status, ['draft', 'paused'], true)) {
            return response()->json([
                'message' => 'Only draft or paused series can be scheduled.',
            ], 422);
        }

        $validated = $request->validate([
            'message_count' => ['required', 'integer', 'min:1', 'max:365'],
        ]);

        try {
            $slots = $this->scheduler->calculateSchedule($series, $validated['message_count']);
        } catch (\InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        DB::transaction(function () use ($series, $slots) {
            // Remove any existing pending messages
            $series->messages()->where('status', 'pending')->delete();

            foreach ($slots as $index => $slot) {
                CampaignMessage::create([
                    'series_id'   => $series->id,
                    'order_index' => $index + 1,
                    'scheduled_at' => $slot,
                    'status'      => 'pending',
                ]);
            }

            $series->update([
                'status'         => 'scheduled',
                'total_messages' => count($slots),
            ]);
        });

        return response()->json([
            'message'       => 'Series scheduled successfully.',
            'total_messages' => count($slots),
            'series'        => $series->fresh('messages'),
        ]);
    }

    /**
     * Activate a draft series (set status to scheduled without recalculating dates).
     * Use this when messages are already created with their scheduled_at dates.
     */
    public function activate(int $id): JsonResponse
    {
        $series = CampaignSeries::findOrFail($id);

        if ($series->status !== 'draft') {
            return response()->json([
                'message' => 'Only draft series can be activated.',
            ], 422);
        }

        $pendingMessages = $series->messages()
            ->where('status', 'pending')
            ->orderBy('order_index')
            ->get();

        if ($pendingMessages->isEmpty()) {
            return response()->json([
                'message' => 'No pending messages found in this series.',
            ], 422);
        }

        // Reschedule past messages: shift them forward preserving intervals
        $now = now();
        $firstPastMessage = $pendingMessages->first(fn ($m) => $m->scheduled_at <= $now);

        if ($firstPastMessage) {
            // Calculate the time shift needed
            $shift = $now->diffInSeconds($firstPastMessage->scheduled_at, false);
            // shift is negative (past), we need to add |shift| + 2 minutes buffer
            $offsetSeconds = abs($shift) + 120;

            $rescheduled = 0;
            foreach ($pendingMessages as $msg) {
                if ($msg->scheduled_at <= $now) {
                    $newDate = $msg->scheduled_at->copy()->addSeconds($offsetSeconds);
                    $msg->update(['scheduled_at' => $newDate]);
                    $rescheduled++;
                }
            }

            Log::info("Series #{$id} activated: rescheduled {$rescheduled} past messages (shifted by {$offsetSeconds}s).");
        }

        $series->update([
            'status'         => 'scheduled',
            'total_messages' => $series->messages()->count(),
        ]);

        return response()->json([
            'message' => $firstPastMessage
                ? "Series activated. {$rescheduled} messages past-due have been rescheduled."
                : 'Series activated.',
            'series'  => $series->fresh('messages'),
        ]);
    }

    /**
     * Set a scheduled series back to draft (pauses sending).
     */
    public function deactivate(int $id): JsonResponse
    {
        $series = CampaignSeries::findOrFail($id);

        if (! in_array($series->status, ['scheduled', 'paused'], true)) {
            return response()->json([
                'message' => 'Only scheduled or paused series can be set to draft.',
            ], 422);
        }

        $series->update(['status' => 'draft']);

        return response()->json([
            'message' => 'Series set back to draft.',
            'series'  => $series->fresh(),
        ]);
    }

    /**
     * Pause an active or scheduled series.
     */
    public function pause(int $id): JsonResponse
    {
        $series = CampaignSeries::findOrFail($id);

        if (! in_array($series->status, ['active', 'scheduled'], true)) {
            return response()->json([
                'message' => 'Only active or scheduled series can be paused.',
            ], 422);
        }

        $series->update(['status' => 'paused']);

        // Pending jobs will be ignored by SendMessageJob's guard (status check)
        // We do not need to cancel queue jobs individually; the status guard handles it.

        return response()->json(['message' => 'Series paused.', 'series' => $series->fresh()]);
    }

    /**
     * Resume a paused series.
     *
     * Does NOT dispatch messages immediately — the scheduler cron (campaigns:dispatch)
     * will pick them up when their scheduled_at time arrives, respecting the send days.
     */
    public function resume(int $id): JsonResponse
    {
        $series = CampaignSeries::findOrFail($id);

        if ($series->status !== 'paused') {
            return response()->json([
                'message' => 'Only paused series can be resumed.',
            ], 422);
        }

        $pendingMessages = $series->messages()
            ->whereIn('status', ['pending', 'partially_sent'])
            ->get();

        $series->update(['status' => $pendingMessages->isNotEmpty() ? 'scheduled' : 'active']);

        // Do NOT dispatch messages here. The campaigns:dispatch cron handles dispatching
        // based on scheduled_at dates. Dispatching all at once would ignore the send schedule.

        return response()->json([
            'message' => 'Series resumed. Messages will be sent according to their schedule.',
            'pending_count' => $pendingMessages->count(),
            'series'        => $series->fresh(),
        ]);
    }

    /**
     * Cancel a series — marks all pending messages as failed.
     */
    public function cancel(int $id): JsonResponse
    {
        $series = CampaignSeries::findOrFail($id);

        if (in_array($series->status, ['completed', 'failed'], true)) {
            return response()->json([
                'message' => 'Series is already completed or failed.',
            ], 422);
        }

        DB::transaction(function () use ($series) {
            $series->messages()
                ->whereIn('status', ['pending', 'sending', 'partially_sent'])
                ->update(['status' => 'failed']);
            $series->update(['status' => 'failed']);
        });

        return response()->json(['message' => 'Series cancelled.', 'series' => $series->fresh()]);
    }

    /**
     * Get all send logs for a series (all messages).
     */
    public function logs(int $id): JsonResponse
    {
        $series = CampaignSeries::findOrFail($id);

        $logs = \App\Models\SendLog::whereIn(
            'message_id',
            $series->messages()->pluck('id')
        )
        ->with('group:id,name,language,whatsapp_group_id')
        ->orderByDesc('sent_at')
        ->get();

        return response()->json($logs);
    }

    /**
     * Send a test message to a single group via the Baileys /send/test endpoint.
     */
    public function testSend(Request $request, int $id): JsonResponse
    {
        $series = CampaignSeries::findOrFail($id);

        $validated = $request->validate([
            'group_wa_id' => ['required', 'string'],
            'language'    => ['required', 'string', 'max:10'],
            'content'     => ['required', 'string'],
        ]);

        $baileysUrl = config('baileys.service_url');
        $baileysKey = config('baileys.api_key');

        $client = new Client(['timeout' => 15]);

        try {
            $response = $client->post("{$baileysUrl}/send/test", [
                'headers' => [
                    'X-API-Key'    => $baileysKey,
                    'Content-Type' => 'application/json',
                    'Accept'       => 'application/json',
                ],
                'json' => [
                    'group_wa_id' => $validated['group_wa_id'],
                    'language'    => $validated['language'],
                    'content'     => $validated['content'],
                    'series_id'   => $series->id,
                ],
            ]);

            $body = json_decode($response->getBody()->getContents(), true);

            return response()->json([
                'message' => 'Test message sent.',
                'result'  => $body,
            ]);
        } catch (RequestException $e) {
            Log::error("SeriesController::testSend failed for series #{$id}: " . $e->getMessage());

            return response()->json([
                'message' => 'Failed to send test message: ' . $e->getMessage(),
            ], 502);
        }
    }
}
