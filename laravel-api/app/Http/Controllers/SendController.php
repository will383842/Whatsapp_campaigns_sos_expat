<?php

namespace App\Http\Controllers;

use App\Models\CampaignMessage;
use App\Models\Group;
use App\Models\SendLog;
use App\Models\WhatsAppNumber;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\Rule;

class SendController extends Controller
{
    /**
     * Receive an individual group send result from the Baileys service.
     * Creates a SendLog entry for each group delivery attempt.
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
            'instance_slug' => ['nullable', 'string', 'max:50'],
        ]);

        $group = Group::where('whatsapp_group_id', $validated['group_wa_id'])->first();

        if (! $group) {
            Log::warning("SendController::report — unknown group WA ID: {$validated['group_wa_id']}");
            return response()->json(['message' => 'Group not found.'], 404);
        }

        // Determine the actual SendLog status:
        // If error_message is 'quota_exceeded', store as quota_exceeded (not failed)
        $logStatus = $validated['status'];
        if ($validated['status'] === 'failed' && ($validated['error_message'] ?? '') === 'quota_exceeded') {
            $logStatus = 'quota_exceeded';
        }

        // Resolve WhatsApp number from instance_slug
        $whatsappNumberId = null;
        if (! empty($validated['instance_slug'])) {
            $waNumber = WhatsAppNumber::where('slug', $validated['instance_slug'])->first();
            if ($waNumber) {
                $whatsappNumberId = $waNumber->id;
                // Increment total messages counter on successful send
                if ($validated['status'] === 'sent') {
                    $waNumber->increment('messages_total');
                }
            }
        }

        SendLog::create([
            'message_id'         => $validated['message_id'],
            'group_id'           => $group->id,
            'language'           => $validated['language'] ?? '',
            'content_sent'       => $validated['content_sent'] ?? '',
            'status'             => $logStatus,
            'sent_at'            => $validated['sent_at'] ?? now(),
            'error_message'      => $logStatus === 'quota_exceeded' ? 'quota_exceeded' : ($validated['error_message'] ?? null),
            'whatsapp_number_id' => $whatsappNumberId,
        ]);

        // Auto-disable groups that are consistently unreachable
        if ($logStatus === 'failed' && $logStatus !== 'quota_exceeded') {
            $errorMsg = $validated['error_message'] ?? '';
            $isGroupDead = str_contains($errorMsg, 'Group not found')
                || str_contains($errorMsg, 'not accessible')
                || str_contains($errorMsg, 'not-authorized');

            if ($isGroupDead) {
                $group->update(['is_active' => false]);
                Log::warning("SendController: group #{$group->id} '{$group->name}' auto-disabled — {$errorMsg}");

                // Telegram alert
                $botToken = config('services.telegram.bot_token');
                if ($botToken) {
                    Http::post("https://api.telegram.org/bot{$botToken}/sendMessage", [
                        'chat_id'    => '7560535072',
                        'text'       => "🗑️ <b>Groupe auto-désactivé</b>\n\n<b>{$group->name}</b> (#{$group->id})\nRaison : {$errorMsg}\n\n<i>Ce groupe ne recevra plus de messages.</i>",
                        'parse_mode' => 'HTML',
                    ]);
                }
            }
        }

        return response()->json(['message' => 'Report received.'], 201);
    }

    /**
     * Receive the final summary from Baileys once all groups have been processed.
     * Updates the CampaignMessage status and increments the series sent_messages counter.
     *
     * If quota_exceeded_count > 0, the message is marked as 'partially_sent' for
     * automatic carry-over by the RetryQuotaExceededMessages command.
     */
    public function reportComplete(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'message_id'           => ['required', 'integer', 'exists:campaign_messages,id'],
            'total_sent'           => ['nullable', 'integer', 'min:0'],
            'total_failed'         => ['nullable', 'integer', 'min:0'],
            'sent_count'           => ['nullable', 'integer', 'min:0'],
            'failed_count'         => ['nullable', 'integer', 'min:0'],
            'quota_exceeded_count' => ['nullable', 'integer', 'min:0'],
            'total'                => ['nullable', 'integer', 'min:0'],
            'completed_at'         => ['nullable', 'date'],
        ]);

        // Normalize field names: accept both conventions
        $totalSent          = $validated['total_sent'] ?? $validated['sent_count'] ?? 0;
        $totalFailed        = $validated['total_failed'] ?? $validated['failed_count'] ?? 0;
        $quotaExceededCount = $validated['quota_exceeded_count'] ?? 0;

        $message = CampaignMessage::with('series')->findOrFail($validated['message_id']);

        DB::transaction(function () use ($message, $totalSent, $totalFailed, $quotaExceededCount) {
            // Determine final status based on quota exceeded
            if ($quotaExceededCount > 0) {
                // Some groups were not sent due to quota — carry over
                $finalStatus = 'partially_sent';

                // Save original_scheduled_at only on the first partial send
                if (! $message->original_scheduled_at) {
                    $message->original_scheduled_at = $message->scheduled_at;
                }

                $message->update([
                    'status'               => $finalStatus,
                    'original_scheduled_at' => $message->original_scheduled_at,
                ]);

                Log::info("SendController: message #{$message->id} partially sent — {$totalSent} sent, {$quotaExceededCount} quota exceeded, will carry over.");
            } else {
                $finalStatus = $totalSent > 0 ? 'sent' : 'failed';

                $message->update([
                    'status'  => $finalStatus,
                    'sent_at' => now(),
                ]);
            }

            $series = $message->series;

            if ($totalSent > 0 && $finalStatus !== 'partially_sent') {
                $series->increment('sent_messages');
            }

            // Check if all messages are now sent/failed — if so, mark series as completed
            // Do NOT complete if any message is partially_sent (still has pending groups)
            $pendingOrSending = $series->messages()
                ->whereIn('status', ['pending', 'sending', 'partially_sent'])
                ->exists();

            if (! $pendingOrSending) {
                $series->update(['status' => 'completed']);
            }
        });

        return response()->json(['message' => 'Completion report processed.']);
    }
}
