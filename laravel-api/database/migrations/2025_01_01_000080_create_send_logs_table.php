<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('send_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('message_id')->constrained('campaign_messages')->cascadeOnDelete();
            $table->foreignId('group_id')->constrained('groups')->cascadeOnDelete();
            $table->string('language', 10);
            $table->text('content_sent');
            $table->enum('status', ['sent', 'failed']);
            $table->timestamp('sent_at')->nullable();
            $table->text('error_message')->nullable();

            $table->index('message_id');
            $table->index('group_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('send_logs');
    }
};
