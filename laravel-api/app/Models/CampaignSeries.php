<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class CampaignSeries extends Model
{
    protected $table = 'campaign_series';

    protected $fillable = [
        'name',
        'type',
        'status',
        'targeting_mode',
        'target_languages',
        'send_days',
        'messages_per_week',
        'send_time',
        'timezone',
        'starts_at',
        'ends_at',
        'total_messages',
        'sent_messages',
        'translation_mode',
        'source_language',
        'notes',
        'created_by',
    ];

    protected $casts = [
        'target_languages' => 'array',
        'send_days' => 'array',
        'starts_at' => 'date',
        'ends_at' => 'date',
    ];

    // Relationships

    public function messages(): HasMany
    {
        return $this->hasMany(CampaignMessage::class, 'series_id')->orderBy('order_index');
    }

    public function seriesTargets(): HasMany
    {
        return $this->hasMany(SeriesTarget::class, 'series_id');
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    // Scopes

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('status', 'active');
    }

    public function scopeDraft(Builder $query): Builder
    {
        return $query->where('status', 'draft');
    }

    public function scopeScheduled(Builder $query): Builder
    {
        return $query->where('status', 'scheduled');
    }
}
