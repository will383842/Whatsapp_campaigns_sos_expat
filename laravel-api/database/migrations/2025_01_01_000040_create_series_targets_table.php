<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('series_targets', function (Blueprint $table) {
            $table->id();
            $table->foreignId('series_id')->constrained('campaign_series')->cascadeOnDelete();
            $table->foreignId('group_id')->constrained('groups')->cascadeOnDelete();
            $table->timestamp('created_at')->nullable();

            $table->unique(['series_id', 'group_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('series_targets');
    }
};
