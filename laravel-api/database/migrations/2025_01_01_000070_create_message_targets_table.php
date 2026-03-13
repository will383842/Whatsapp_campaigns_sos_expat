<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('message_targets', function (Blueprint $table) {
            $table->id();
            $table->foreignId('message_id')->constrained('campaign_messages')->cascadeOnDelete();
            $table->foreignId('group_id')->constrained('groups')->cascadeOnDelete();
            $table->text('custom_content')->nullable();
            $table->timestamp('created_at')->nullable();

            $table->unique(['message_id', 'group_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('message_targets');
    }
};
