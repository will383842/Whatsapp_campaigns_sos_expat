<?php

namespace App\Console\Commands;

use App\Models\CampaignMessage;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

class CleanStuckMessages extends Command
{
    protected $signature = 'campaigns:clean-stuck';

    protected $description = 'Mark messages stuck in "sending" state for more than 2 hours as failed.';

    public function handle(): int
    {
        $cutoff = now()->subHours(2);

        $stuck = CampaignMessage::where('status', 'sending')
            ->where('updated_at', '<', $cutoff)
            ->get();

        if ($stuck->isEmpty()) {
            $this->info('No stuck messages found.');
            return self::SUCCESS;
        }

        $count = $stuck->count();

        CampaignMessage::whereIn('id', $stuck->pluck('id'))
            ->update(['status' => 'failed']);

        $this->info("Marked {$count} stuck message(s) as failed.");
        Log::warning("campaigns:clean-stuck — marked {$count} message(s) stuck in 'sending' as failed.", [
            'message_ids' => $stuck->pluck('id')->toArray(),
        ]);

        return self::SUCCESS;
    }
}
