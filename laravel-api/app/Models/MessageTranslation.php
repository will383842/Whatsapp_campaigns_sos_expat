<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MessageTranslation extends Model
{
    protected $fillable = [
        'message_id',
        'language',
        'content',
        'translated_by',
    ];

    public function message(): BelongsTo
    {
        return $this->belongsTo(CampaignMessage::class, 'message_id');
    }
}
