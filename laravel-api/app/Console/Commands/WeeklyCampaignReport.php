<?php

namespace App\Console\Commands;

use App\Models\CampaignSeries;
use App\Models\SendLog;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class WeeklyCampaignReport extends Command
{
    protected $signature = 'campaigns:weekly-report';

    protected $description = 'Send a weekly campaign status report via Telegram.';

    private const TELEGRAM_CHAT_ID = '7560535072';

    private const STATUS_EMOJI = [
        'draft'     => "\u{1F4DD}", // 📝
        'scheduled' => "\u{1F4C5}", // 📅
        'active'    => "\u{2705}",  // ✅
        'paused'    => "\u{23F8}",  // ⏸
        'completed' => "\u{1F3C1}", // 🏁
        'failed'    => "\u{274C}",  // ❌
    ];

    public function handle(): int
    {
        $botToken = config('services.telegram.bot_token');

        if (! $botToken) {
            $this->error('TELEGRAM_BOT_TOKEN not configured.');
            return self::FAILURE;
        }

        // Fetch all non-completed series
        $activeSeries = CampaignSeries::whereNotIn('status', ['completed', 'failed'])
            ->with(['messages'])
            ->orderByRaw("FIELD(status, 'active', 'scheduled', 'paused', 'draft')")
            ->get();

        // Stats for last 7 days
        $weekAgo = now()->subDays(7);
        $sentThisWeek = SendLog::where('status', 'sent')
            ->where('sent_at', '>=', $weekAgo)
            ->count();
        $failedThisWeek = SendLog::where('status', 'failed')
            ->where('sent_at', '>=', $weekAgo)
            ->count();

        // Recently completed (last 7 days)
        $recentlyCompleted = CampaignSeries::where('status', 'completed')
            ->where('updated_at', '>=', $weekAgo)
            ->get();

        // Build message
        $lines = [];
        $lines[] = "<b>\u{1F4CA} Rapport hebdomadaire — Campagnes WhatsApp</b>";
        $lines[] = "<i>" . now()->format('d/m/Y H:i') . "</i>";
        $lines[] = '';

        // Weekly stats
        $lines[] = "<b>\u{1F4C8} Cette semaine :</b>";
        $lines[] = "  \u{2709} {$sentThisWeek} messages envoyés";
        if ($failedThisWeek > 0) {
            $lines[] = "  \u{26A0} {$failedThisWeek} messages échoués";
        }
        $lines[] = '';

        // Active campaigns
        if ($activeSeries->isEmpty()) {
            $lines[] = "\u{1F4AD} <i>Aucune campagne en cours.</i>";
        } else {
            $lines[] = "<b>\u{1F680} Campagnes en cours ({$activeSeries->count()}) :</b>";
            $lines[] = '';

            foreach ($activeSeries as $series) {
                $emoji = self::STATUS_EMOJI[$series->status] ?? "\u{2753}";
                $statusLabel = match ($series->status) {
                    'draft'     => 'Brouillon',
                    'scheduled' => 'Planifiée',
                    'active'    => 'Active',
                    'paused'    => 'En pause',
                    default     => $series->status,
                };

                $sent = $series->sent_messages ?? 0;
                $total = $series->total_messages ?? 0;
                $pending = $series->messages->where('status', 'pending')->count();
                $partiallySent = $series->messages->where('status', 'partially_sent')->count();
                $progress = $total > 0 ? round(($sent / $total) * 100) : 0;

                $nextMessage = $series->messages
                    ->whereIn('status', ['pending', 'partially_sent'])
                    ->sortBy('scheduled_at')
                    ->first();

                $lines[] = "{$emoji} <b>{$series->name}</b>";
                $lines[] = "   Statut : {$statusLabel} | {$sent}/{$total} envoyés ({$progress}%)";

                if ($partiallySent > 0) {
                    $lines[] = "   \u{1F7E0} {$partiallySent} message(s) partiellement envoyé(s) (quota)";
                }

                if ($pending > 0 && $nextMessage) {
                    $nextDate = \Carbon\Carbon::parse($nextMessage->scheduled_at)
                        ->format('d/m à H:i');
                    $lines[] = "   Prochain envoi : {$nextDate} ({$pending} restants)";
                }

                // Target info
                $langs = $series->target_languages;
                if ($langs && count($langs) > 0) {
                    $lines[] = '   Langues : ' . implode(', ', array_map('strtoupper', $langs));
                }

                $lines[] = '';
            }
        }

        // Recently completed
        if ($recentlyCompleted->isNotEmpty()) {
            $lines[] = "<b>\u{1F3C1} Terminées cette semaine :</b>";
            foreach ($recentlyCompleted as $series) {
                $lines[] = "  \u{2714} {$series->name} ({$series->sent_messages} messages)";
            }
            $lines[] = '';
        }

        $lines[] = "\u{1F517} <a href=\"https://whatsapp.life-expat.com/series\">Voir le dashboard</a>";

        $text = implode("\n", $lines);

        // Send via Telegram
        try {
            Http::post("https://api.telegram.org/bot{$botToken}/sendMessage", [
                'chat_id'    => self::TELEGRAM_CHAT_ID,
                'text'       => $text,
                'parse_mode' => 'HTML',
                'disable_web_page_preview' => true,
            ]);

            $this->info('Weekly report sent to Telegram.');
            Log::info('campaigns:weekly-report sent to Telegram.');
        } catch (\Exception $e) {
            $this->error('Failed to send report: ' . $e->getMessage());
            Log::error('campaigns:weekly-report failed: ' . $e->getMessage());
            return self::FAILURE;
        }

        return self::SUCCESS;
    }
}
