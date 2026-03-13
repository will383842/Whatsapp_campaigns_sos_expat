<?php

namespace App\Http\Controllers;

use App\Models\CampaignMessage;
use App\Models\CampaignSeries;
use App\Models\Group;
use App\Models\SendLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

class StatsController extends Controller
{
    public function index(): JsonResponse
    {
        // Active series count
        $activeSeries = CampaignSeries::whereIn('status', ['active', 'scheduled'])->count();

        // Messages sent this month
        $messagesSentThisMonth = SendLog::where('status', 'sent')
            ->whereMonth('sent_at', now()->month)
            ->whereYear('sent_at', now()->year)
            ->count();

        // Global success rate (all time)
        $totalLogs = SendLog::count();
        $sentLogs  = SendLog::where('status', 'sent')->count();
        $successRate = $totalLogs > 0
            ? round(($sentLogs / $totalLogs) * 100, 1)
            : 0.0;

        // Active groups count (groups that have received at least one message)
        $activeGroups = Group::where('is_active', true)->count();

        // Breakdown by language (sent logs this month)
        $byLanguage = SendLog::where('status', 'sent')
            ->whereMonth('sent_at', now()->month)
            ->whereYear('sent_at', now()->year)
            ->select('language', DB::raw('count(*) as count'))
            ->groupBy('language')
            ->orderByDesc('count')
            ->get()
            ->map(fn ($row) => ['language' => $row->language, 'count' => (int) $row->count])
            ->values();

        // Next scheduled send
        $nextMessage = CampaignMessage::where('status', 'pending')
            ->orderBy('scheduled_at')
            ->first();

        $nextSend = $nextMessage?->scheduled_at?->toIso8601String();

        // Build a complete 30-day array (no gaps)
        $logsByDate = SendLog::where('status', 'sent')
            ->where('sent_at', '>=', now()->subDays(29)->startOfDay())
            ->select(DB::raw('DATE(sent_at) as date'), DB::raw('count(*) as count'))
            ->groupBy('date')
            ->orderBy('date')
            ->get()
            ->mapWithKeys(fn ($row) => [$row->date => (int) $row->count]);

        $last30Days = collect();
        for ($i = 29; $i >= 0; $i--) {
            $date = now()->subDays($i)->format('Y-m-d');
            $last30Days->push(['date' => $date, 'count' => $logsByDate->get($date, 0)]);
        }

        return response()->json([
            'active_series'            => $activeSeries,
            'messages_sent_this_month' => $messagesSentThisMonth,
            'success_rate'             => $successRate,
            'active_groups'            => $activeGroups,
            'by_language'              => $byLanguage,
            'next_send'                => $nextSend,
            'last_30_days'             => $last30Days,
        ]);
    }
}
