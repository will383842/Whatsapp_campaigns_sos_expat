<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SeriesTarget extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'series_id',
        'group_id',
    ];

    protected $casts = [
        'created_at' => 'datetime',
    ];

    public function series(): BelongsTo
    {
        return $this->belongsTo(CampaignSeries::class, 'series_id');
    }

    public function group(): BelongsTo
    {
        return $this->belongsTo(Group::class);
    }
}
