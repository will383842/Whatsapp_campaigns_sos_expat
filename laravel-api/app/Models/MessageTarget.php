<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MessageTarget extends Model
{
    const CREATED_AT = 'created_at';
    const UPDATED_AT = null;

    protected $fillable = ['message_id', 'group_id', 'custom_content'];

    public function message(): BelongsTo
    {
        return $this->belongsTo(CampaignMessage::class, 'message_id');
    }

    public function group(): BelongsTo
    {
        return $this->belongsTo(Group::class);
    }
}
