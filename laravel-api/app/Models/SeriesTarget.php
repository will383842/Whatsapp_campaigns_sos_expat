<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SeriesTarget extends Model
{
    const CREATED_AT = 'created_at';
    const UPDATED_AT = null;

    protected $fillable = ['series_id', 'group_id'];

    public function series(): BelongsTo
    {
        return $this->belongsTo(CampaignSeries::class, 'series_id');
    }

    public function group(): BelongsTo
    {
        return $this->belongsTo(Group::class);
    }
}
