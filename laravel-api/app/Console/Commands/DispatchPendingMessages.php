<?php

namespace App\Console\Commands;

use App\Jobs\SendMessageJob;
use App\Models\CampaignMessage;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class DispatchPendingMessages extends Command
{
    /**
     * The name and signature of the console command.
     */
    protected $signature = 'campaigns:dispatch';

    /**
     * The console command description.
     */
    protected $description = 'Dispatch pending campaign messages whose scheduled_at time has arrived.';

    /**
     * Maximum number of campaign messages sending simultaneously.
     * Prevents overwhelming WhatsApp with parallel campaign sends.
     */
    private const MAX_CONCURRENT_SENDING = 2;

    public function handle(): int
    {
        // Only dispatch ONE message per series at a time.
        // Skip series that already have a message in 'sending' state.
        // Global limit: max MAX_CONCURRENT_SENDING messages sending at once.
        $messages = DB::transaction(function () {
            // Find series that have messages being sent right now
            $busySeriesIds = CampaignMessage::where('status', 'sending')
                ->distinct()
                ->pluck('series_id');

            // Global throttle: if too many messages are already being sent, wait
            $currentSendingCount = CampaignMessage::where('status', 'sending')->count();
            if ($currentSendingCount >= self::MAX_CONCURRENT_SENDING) {
                return collect();
            }

            $availableSlots = self::MAX_CONCURRENT_SENDING - $currentSendingCount;

            // Get the NEXT pending message per series (lowest order_index)
            $candidates = CampaignMessage::where('status', 'pending')
                ->where('scheduled_at', '<=', now())
                ->whereHas('series', fn ($q) => $q->whereNotIn('status', ['draft']))
                ->when($busySeriesIds->isNotEmpty(), fn ($q) => $q->whereNotIn('series_id', $busySeriesIds))
                ->orderBy('series_id')
                ->orderBy('order_index')
                ->lockForUpdate()
                ->get()
                ->unique('series_id') // Keep only the first (lowest order) per series
                ->take($availableSlots); // Respect global limit

            if ($candidates->isNotEmpty()) {
                CampaignMessage::whereIn('id', $candidates->pluck('id'))
                    ->update(['status' => 'sending']);
            }

            return $candidates;
        });

        if ($messages->isEmpty()) {
            $this->info('No pending messages to dispatch.');
            return self::SUCCESS;
        }

        $count = $messages->count();

        foreach ($messages as $message) {
            dispatch(new SendMessageJob($message->id));
        }

        $this->info("Dispatched {$count} message(s) — one per series.");
        Log::info("campaigns:dispatch — dispatched {$count} message(s), one per series.");

        return self::SUCCESS;
    }
}
