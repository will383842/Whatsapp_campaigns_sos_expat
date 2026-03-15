<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class WhatsAppNumber extends Model
{
    protected $table = 'whatsapp_numbers';

    protected $fillable = [
        'slug',
        'name',
        'phone',
        'status',
        'is_default',
        'is_rotation_enabled',
        'daily_max',
        'daily_sent',
        'messages_total',
        'ban_count',
        'last_connected_at',
        'last_error',
    ];

    protected $casts = [
        'is_default' => 'boolean',
        'is_rotation_enabled' => 'boolean',
        'last_connected_at' => 'datetime',
    ];

    public function sendLogs(): HasMany
    {
        return $this->hasMany(SendLog::class);
    }

    /**
     * Scope: active numbers for rotation.
     */
    public function scopeForRotation($query)
    {
        return $query->where('status', 'active')->where('is_rotation_enabled', true);
    }
}
