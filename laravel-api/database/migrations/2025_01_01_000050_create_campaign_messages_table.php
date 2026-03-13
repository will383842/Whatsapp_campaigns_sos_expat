<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('campaign_messages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('series_id')->constrained('campaign_series')->cascadeOnDelete();
            $table->tinyInteger('order_index')->unsigned();
            $table->timestamp('scheduled_at');
            $table->enum('status', ['pending', 'sending', 'sent', 'failed'])->default('pending');
            $table->timestamp('sent_at')->nullable();
            $table->timestamps();

            $table->index(['scheduled_at', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('campaign_messages');
    }
};
