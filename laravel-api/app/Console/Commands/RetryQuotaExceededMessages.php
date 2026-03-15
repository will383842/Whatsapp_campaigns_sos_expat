<?php

namespace App\Console\Commands;

use App\Jobs\SendMessageJob;
use App\Models\CampaignMessage;
use App\Models\SendLog;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class RetryQuotaExceededMessages extends Command
{
    protected $signature = 'campaigns:retry-quota';

    protected $description = 'Re-dispatch partially_sent messages whose quota-exceeded groups can be retried (new day).';

    public function handle(): int
    {
        $messages = DB::transaction(function () {
            // Find partially_sent messages that are ready for retry:
            // - Status is 'partially_sent'
            // - It's a new day compared to when the last send attempt happened
            //   (we check that no 'sent' SendLog exists for today, meaning the quota has reset)
            $candidates = CampaignMessage::where('status', 'partially_sent')
                ->whereHas('series', fn ($q) => $q->whereNotIn('status', ['draft', 'paused', 'failed', 'completed']))
                ->lockForUpdate()
                ->get();

            if ($candidates->isEmpty()) {
                return collect();
            }

            // Filter: only retry if the last quota_exceeded log was from a previous day
            $retryable = $candidates->filter(function ($message) {
                $lastQuotaLog = SendLog::where('message_id', $message->id)
                    ->where('status', 'quota_exceeded')
                    ->orderByDesc('sent_at')
                    ->first();

                if (! $lastQuotaLog || ! $lastQuotaLog->sent_at) {
                    return true; // No log found, safe to retry
                }

                // Only retry if the quota_exceeded log is from a previous day (UTC)
                return $lastQuotaLog->sent_at->startOfDay()->lt(now()->startOfDay());
            });

            if ($retryable->isEmpty()) {
                return collect();
            }

            // Mark them as 'sending' for dispatch
            CampaignMessage::whereIn('id', $retryable->pluck('id'))
                ->update(['status' => 'sending']);

            // Delete old quota_exceeded SendLogs so they don't interfere with new send
            foreach ($retryable as $message) {
                SendLog::where('message_id', $message->id)
                    ->where('status', 'quota_exceeded')
                    ->delete();
            }

            return $retryable;
        });

        if ($messages->isEmpty()) {
            $this->info('No partially_sent messages to retry.');
            return self::SUCCESS;
        }

        $count = $messages->count();

        foreach ($messages as $message) {
            dispatch(new SendMessageJob($message->id));
        }

        $this->info("Retried {$count} partially_sent message(s).");
        Log::info("campaigns:retry-quota — dispatched {$count} partially_sent message(s) for carry-over.");

        return self::SUCCESS;
    }
}
