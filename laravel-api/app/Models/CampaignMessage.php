<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class CampaignMessage extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'series_id',
        'order_index',
        'scheduled_at',
        'original_scheduled_at',
        'status',
        'sent_at',
    ];

    protected $casts = [
        'scheduled_at' => 'datetime',
        'original_scheduled_at' => 'datetime',
        'sent_at' => 'datetime',
    ];

    // Relationships

    public function series(): BelongsTo
    {
        return $this->belongsTo(CampaignSeries::class, 'series_id');
    }

    public function translations(): HasMany
    {
        return $this->hasMany(MessageTranslation::class, 'message_id');
    }

    public function targets(): HasMany
    {
        return $this->hasMany(MessageTarget::class, 'message_id');
    }

    public function sendLogs(): HasMany
    {
        return $this->hasMany(SendLog::class, 'message_id');
    }

    // Methods

    public function getTranslationForLanguage(string $lang): ?MessageTranslation
    {
        return $this->translations()->where('language', $lang)->first();
    }
}
