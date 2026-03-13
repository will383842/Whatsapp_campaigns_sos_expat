<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Group extends Model
{
    protected $fillable = [
        'whatsapp_group_id',
        'name',
        'language',
        'country',
        'continent',
        'member_count',
        'is_active',
    ];

    protected $casts = [
        'is_active' => 'boolean',
        'member_count' => 'integer',
    ];

    public function seriesTargets(): HasMany
    {
        return $this->hasMany(SeriesTarget::class);
    }

    public function messageTargets(): HasMany
    {
        return $this->hasMany(MessageTarget::class);
    }

    public function sendLogs(): HasMany
    {
        return $this->hasMany(SendLog::class);
    }
}
