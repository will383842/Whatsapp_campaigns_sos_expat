<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class GroupMember extends Model
{
    protected $fillable = [
        'group_id',
        'phone',
        'whatsapp_name',
        'push_name',
        'is_admin',
        'welcome_sent',
        'joined_at',
        'left_at',
    ];

    protected $casts = [
        'is_admin' => 'boolean',
        'welcome_sent' => 'boolean',
        'joined_at' => 'datetime',
        'left_at' => 'datetime',
    ];

    public function group(): BelongsTo
    {
        return $this->belongsTo(Group::class);
    }

    /**
     * Display name: push_name > whatsapp_name > formatted phone.
     */
    public function getDisplayNameAttribute(): string
    {
        return $this->push_name
            ?? $this->whatsapp_name
            ?? '+' . $this->phone;
    }
}
