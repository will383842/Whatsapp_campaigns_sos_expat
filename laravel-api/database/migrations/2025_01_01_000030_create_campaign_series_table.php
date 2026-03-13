<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('campaign_series', function (Blueprint $table) {
            $table->id();
            $table->string('name', 255);
            $table->enum('type', ['drip', 'one_shot'])->default('drip');
            $table->enum('status', ['draft', 'scheduled', 'active', 'completed', 'paused', 'failed'])->default('draft');
            $table->enum('targeting_mode', ['by_language', 'by_group', 'hybrid'])->default('by_language');
            $table->json('target_languages')->nullable();
            $table->json('send_days')->nullable();
            $table->smallInteger('messages_per_week')->unsigned()->nullable();
            $table->time('send_time')->default('09:00:00');
            $table->string('timezone', 50)->default('Europe/Paris');
            $table->date('starts_at');
            $table->date('ends_at')->nullable();
            $table->smallInteger('total_messages')->unsigned()->default(0);
            $table->smallInteger('sent_messages')->unsigned()->default(0);
            $table->enum('translation_mode', ['auto', 'manual'])->default('auto');
            $table->string('source_language', 10)->nullable()->default('fr');
            $table->text('notes')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('campaign_series');
    }
};
