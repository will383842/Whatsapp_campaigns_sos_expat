<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('message_translations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('message_id')->constrained('campaign_messages')->cascadeOnDelete();
            $table->string('language', 10);
            $table->text('content');
            $table->enum('translated_by', ['manual', 'gpt4o'])->default('manual');
            $table->timestamps();

            $table->unique(['message_id', 'language']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('message_translations');
    }
};
