<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Dispatch pending campaign messages every minute.
// The command marks messages as 'sending' atomically before dispatching jobs,
// preventing double dispatch if the scheduler overlaps.
Schedule::command('campaigns:dispatch')->everyMinute()->withoutOverlapping();

// Clean stuck messages every 30 minutes (messages in "sending" state for > 2 hours).
Schedule::command('campaigns:clean-stuck')->everyThirtyMinutes()->withoutOverlapping();

// Retry partially_sent messages (quota carry-over) every minute.
// Only dispatches if it's a new day since the last quota_exceeded attempt.
Schedule::command('campaigns:retry-quota')->everyMinute()->withoutOverlapping();

// Send batch welcome messages once a day at 10:00 Paris time.
// Groups all new members per group into ONE message instead of individual sends.
Schedule::command('welcome:send-batch')
    ->dailyAt('10:00')
    ->timezone('Europe/Paris')
    ->withoutOverlapping();

// Weekly campaign status report via Telegram (every Monday at 9:00 Paris time)
Schedule::command('campaigns:weekly-report')
    ->weeklyOn(1, '09:00')
    ->timezone('Europe/Paris')
    ->withoutOverlapping();
