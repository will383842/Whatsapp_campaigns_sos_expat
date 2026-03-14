<?php

namespace App\Http\Controllers;

use App\Models\CampaignMessage;
use App\Models\Group;
use App\Models\SendLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\Rule;

class SendController extends Controller
{
    /**
     * Receive an individual group send result from the Baileys service.
     * Creates a SendLog entry for each group delivery attempt.
     *
     * Expected payload:
     * {
     *   "message_id": 1,
     *   "group_wa_id": "1234567890@g.us",
     *   "language": "fr",
     *   "content_sent": "...",
     *   "status": "sent" | "failed",
     *   "sent_at": "2025-01-01T10:00:00Z",
     *   "error_message": null
     * }
     */
    public function report(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'message_id'    => ['required', 'integer', 'exists:campaign_messages,id'],
            'group_wa_id'   => ['required', 'string'],
            'language'      => ['nullable', 'string', 'max:10'],
            'content_sent'  => ['nullable', 'string'],
            'status'        => ['required', Rule::in(['sent', 'failed'])],
            'sent_at'       => ['nullable', 'date'],
            'error_message' => ['nullable', 'string'],
        ]);

        $group = Group::where('whatsapp_group_id', $validated['group_wa_id'])->first();

        if (! $group) {
            Log::warning("SendController::report — unknown group WA ID: {$validated['group_wa_id']}");
            return response()->json(['message' => 'Group not found.'], 404);
        }

        SendLog::create([
            'message_id'    => $validated['message_id'],
            'group_id'      => $group->id,
            'language'      => $validated['language'] ?? '',
            'content_sent'  => $validated['content_sent'] ?? '',
            'status'        => $validated['status'],
            'sent_at'       => $validated['sent_at'] ?? now(),
            'error_message' => $validated['error_message'] ?? null,
        ]);

        return response()->json(['message' => 'Report received.'], 201);
    }

    /**
     * Receive the final summary from Baileys once all groups have been processed.
     * Updates the CampaignMessage status and increments the series sent_messages counter.
     *
     * Expected payload:
     * {
     *   "message_id": 1,
     *   "total_sent": 60,
     *   "total_failed": 2,
     *   "completed_at": "2025-01-01T10:05:00Z"
     * }
     */
    public function reportComplete(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'message_id'   => ['required', 'integer', 'exists:campaign_messages,id'],
            // Accept both naming conventions (total_sent/sent_count)
            'total_sent'   => ['nullable', 'integer', 'min:0'],
            'total_failed' => ['nullable', 'integer', 'min:0'],
            'sent_count'   => ['nullable', 'integer', 'min:0'],
            'failed_count' => ['nullable', 'integer', 'min:0'],
            'total'        => ['nullable', 'integer', 'min:0'],
            'completed_at' => ['nullable', 'date'],
        ]);

        // Normalize field names: accept both conventions
        $totalSent   = $validated['total_sent'] ?? $validated['sent_count'] ?? 0;
        $totalFailed = $validated['total_failed'] ?? $validated['failed_count'] ?? 0;

        $message = CampaignMessage::with('series')->findOrFail($validated['message_id']);

        DB::transaction(function () use ($message, $totalSent, $totalFailed) {
            $finalStatus = $totalSent > 0 ? 'sent' : 'failed';

            $message->update([
                'status'  => $finalStatus,
                'sent_at' => now(),
            ]);

            $series = $message->series;

            if ($totalSent > 0) {
                $series->increment('sent_messages');
            }

            // Check if all messages are now sent/failed — if so, mark series as completed
            $pendingOrSending = $series->messages()
                ->whereIn('status', ['pending', 'sending'])
                ->exists();

            if (! $pendingOrSending) {
                $series->update(['status' => 'completed']);
            }
        });

        return response()->json(['message' => 'Completion report processed.']);
    }
}
