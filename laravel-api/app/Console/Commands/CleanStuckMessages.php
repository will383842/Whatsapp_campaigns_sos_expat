<?php

namespace App\Console\Commands;

use App\Models\CampaignMessage;
use App\Models\CampaignSeries;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class CleanStuckMessages extends Command
{
    protected $signature = 'campaigns:clean-stuck';

    protected $description = 'Reset messages stuck in "sending" state for more than 2 hours back to pending for retry, and complete stalled series.';

    public function handle(): int
    {
        $cutoff = now()->subHours(2);

        // --- 1. Reset stuck messages to pending for retry ---
        $stuck = CampaignMessage::where('status', 'sending')
            ->where('updated_at', '<', $cutoff)
            ->get();

        if ($stuck->isNotEmpty()) {
            $count = $stuck->count();

            // Reset to pending so the dispatcher can retry them
            CampaignMessage::whereIn('id', $stuck->pluck('id'))
                ->update(['status' => 'pending']);

            $this->info("Reset {$count} stuck message(s) to pending for retry.");
            Log::warning("campaigns:clean-stuck — reset {$count} message(s) stuck in 'sending' to 'pending'.", [
                'message_ids' => $stuck->pluck('id')->toArray(),
            ]);

            // Alert via Telegram
            $botToken = config('services.telegram.bot_token');
            if ($botToken) {
                $ids = $stuck->pluck('id')->implode(', ');
                Http::post("https://api.telegram.org/bot{$botToken}/sendMessage", [
                    'chat_id'    => '7560535072',
                    'text'       => "⚠️ campaigns:clean-stuck — {$count} message(s) bloqués en 'sending' depuis +2h remis en 'pending' pour retry.\nIDs: {$ids}",
                    'parse_mode' => 'HTML',
                ]);
            }
        } else {
            $this->info('No stuck messages found.');
        }

        // --- 2. Complete stalled series (no pending/sending/partially_sent messages left) ---
        $stalledSeries = CampaignSeries::whereIn('status', ['active', 'scheduled'])
            ->get()
            ->filter(function (CampaignSeries $series) {
                return ! $series->messages()
                    ->whereIn('status', ['pending', 'sending', 'partially_sent'])
                    ->exists();
            });

        foreach ($stalledSeries as $series) {
            $series->update(['status' => 'completed']);
            $this->info("Series #{$series->id} '{$series->name}' marked as completed (no pending messages).");
            Log::info("campaigns:clean-stuck — series #{$series->id} auto-completed (all messages sent/failed).");
        }

        if ($stalledSeries->isEmpty()) {
            $this->info('No stalled series found.');
        }

        return self::SUCCESS;
    }
}
