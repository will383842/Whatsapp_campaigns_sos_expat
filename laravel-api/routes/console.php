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
