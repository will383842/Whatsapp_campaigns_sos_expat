<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Group extends Model
{
    protected $fillable = [
        'whatsapp_group_id',
        'name',
        'community_name',
        'language',
        'country',
        'continent',
        'member_count',
        'is_active',
        'welcome_enabled',
        'welcome_message',
        'invite_link',
    ];

    protected $casts = [
        'is_active' => 'boolean',
        'welcome_enabled' => 'boolean',
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

    public function members(): HasMany
    {
        return $this->hasMany(GroupMember::class);
    }
}
