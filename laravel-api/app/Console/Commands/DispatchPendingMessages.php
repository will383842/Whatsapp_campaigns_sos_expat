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

    public function handle(): int
    {
        // Use a DB transaction to atomically find and mark messages as 'sending'
        // to prevent double dispatch if the scheduler fires twice in quick succession.
        $messages = DB::transaction(function () {
            $pending = CampaignMessage::where('status', 'pending')
                ->where('scheduled_at', '<=', now())
                ->lockForUpdate()
                ->get();

            if ($pending->isNotEmpty()) {
                CampaignMessage::whereIn('id', $pending->pluck('id'))
                    ->update(['status' => 'sending']);
            }

            return $pending;
        });

        if ($messages->isEmpty()) {
            $this->info('No pending messages to dispatch.');
            return self::SUCCESS;
        }

        $count = $messages->count();

        foreach ($messages as $message) {
            dispatch(new SendMessageJob($message->id));
        }

        $this->info("Dispatched {$count} message job(s).");
        Log::info("campaigns:dispatch — dispatched {$count} message job(s).");

        return self::SUCCESS;
    }
}
