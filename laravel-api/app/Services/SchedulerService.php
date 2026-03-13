<?php

namespace App\Services;

use App\Models\CampaignSeries;
use Carbon\Carbon;
use Carbon\CarbonTimeZone;
use Illuminate\Support\Collection;
use InvalidArgumentException;

class SchedulerService
{
    /**
     * Day-name to Carbon constant mapping.
     */
    private const DAY_MAP = [
        'monday'    => Carbon::MONDAY,
        'tuesday'   => Carbon::TUESDAY,
        'wednesday' => Carbon::WEDNESDAY,
        'thursday'  => Carbon::THURSDAY,
        'friday'    => Carbon::FRIDAY,
        'saturday'  => Carbon::SATURDAY,
        'sunday'    => Carbon::SUNDAY,
    ];

    /**
     * Minimum gap (in hours) required between consecutive messages.
     */
    private const MIN_GAP_HOURS = 2;

    /**
     * Calculate the array of Carbon timestamps for $messageCount messages in the series.
     *
     * @param  CampaignSeries  $series
     * @param  int             $messageCount
     * @return Carbon[]
     *
     * @throws InvalidArgumentException if overlap is detected between consecutive slots
     */
    public function calculateSchedule(CampaignSeries $series, int $messageCount): array
    {
        $tz = new CarbonTimeZone($series->timezone ?: 'Europe/Paris');
        $sendDays = array_map('strtolower', $series->send_days ?? []);

        if (empty($sendDays)) {
            throw new InvalidArgumentException('Series must have at least one send_day configured.');
        }

        [$sendHour, $sendMinute] = $this->parseSendTime($series->send_time ?? '09:00:00');

        /** @var Carbon $cursor */
        $cursor = Carbon::parse($series->starts_at->format('Y-m-d'), $tz)
            ->setTime($sendHour, $sendMinute, 0);

        $slots = [];
        $maxIterations = $messageCount * 365; // Safety ceiling
        $iterations = 0;

        while (count($slots) < $messageCount && $iterations < $maxIterations) {
            $iterations++;
            $dayName = strtolower($cursor->format('l'));

            if (in_array($dayName, $sendDays, true)) {
                $slot = $cursor->copy();

                // Anti-overlap: ensure >= MIN_GAP_HOURS from previous slot
                if (! empty($slots)) {
                    $prev = end($slots);
                    $diffHours = $prev->diffInHours($slot, false);

                    if ($diffHours < self::MIN_GAP_HOURS) {
                        throw new InvalidArgumentException(
                            sprintf(
                                'Schedule overlap detected: messages at %s and %s are less than %d hours apart.',
                                $prev->toDateTimeString(),
                                $slot->toDateTimeString(),
                                self::MIN_GAP_HOURS
                            )
                        );
                    }
                }

                $slots[] = $slot;
            }

            $cursor->addDay();
        }

        if (count($slots) < $messageCount) {
            throw new InvalidArgumentException(
                "Could not schedule {$messageCount} messages within a reasonable timeframe given the send_days configuration."
            );
        }

        return $slots;
    }

    /**
     * Validate that no other active or scheduled series targeting the same groups
     * has a message within a 2-hour window of the proposed start time.
     *
     * @param  CampaignSeries  $series        The series being scheduled (excluded from conflict check)
     * @param  Carbon          $proposedStart
     * @return bool  True if no overlap exists
     */
    public function validateNoOverlap(CampaignSeries $series, Carbon $proposedStart): bool
    {
        $windowStart = $proposedStart->copy()->subHours(self::MIN_GAP_HOURS);
        $windowEnd   = $proposedStart->copy()->addHours(self::MIN_GAP_HOURS);

        // Collect group IDs targeted by this series
        $groupIds = $this->getSeriesGroupIds($series);

        if ($groupIds->isEmpty()) {
            return true;
        }

        // Find conflicting messages from other active/scheduled series
        $conflict = \App\Models\CampaignMessage::query()
            ->whereIn('status', ['pending', 'sending'])
            ->whereBetween('scheduled_at', [$windowStart, $windowEnd])
            ->whereHas('series', function ($q) use ($series) {
                $q->whereIn('status', ['active', 'scheduled'])
                  ->where('id', '!=', $series->id);
            })
            ->whereHas('series.seriesTargets', function ($q) use ($groupIds) {
                $q->whereIn('group_id', $groupIds);
            })
            ->exists();

        return ! $conflict;
    }

    /**
     * Collect the group IDs targeted by a series based on its targeting_mode.
     */
    private function getSeriesGroupIds(CampaignSeries $series): Collection
    {
        if ($series->targeting_mode === 'by_language') {
            return \App\Models\Group::whereIn('language', $series->target_languages ?? [])
                ->pluck('id');
        }

        return \App\Models\SeriesTarget::where('series_id', $series->id)
            ->pluck('group_id');
    }

    /**
     * Parse "HH:MM:SS" or "HH:MM" into [hour, minute].
     *
     * @return array{0: int, 1: int}
     */
    private function parseSendTime(string $sendTime): array
    {
        $parts = explode(':', $sendTime);

        return [(int) ($parts[0] ?? 9), (int) ($parts[1] ?? 0)];
    }
}
