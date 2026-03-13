<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('campaign_series', function (Blueprint $table) {
            $table->index('created_by');
            $table->index('status');
            $table->index(['status', 'starts_at']);
        });

        Schema::table('campaign_messages', function (Blueprint $table) {
            $table->index('series_id');
            $table->index(['status', 'scheduled_at']);
        });

        Schema::table('series_targets', function (Blueprint $table) {
            $table->index('series_id');
            $table->index('group_id');
        });

        Schema::table('message_translations', function (Blueprint $table) {
            $table->index('message_id');
            $table->index(['message_id', 'language']);
        });

        Schema::table('message_targets', function (Blueprint $table) {
            $table->index('message_id');
            $table->index('group_id');
        });

        Schema::table('send_logs', function (Blueprint $table) {
            $table->index('message_id');
            $table->index('group_id');
        });
    }

    public function down(): void
    {
        Schema::table('campaign_series', function (Blueprint $table) {
            $table->dropIndex(['created_by']);
            $table->dropIndex(['status']);
            $table->dropIndex(['status', 'starts_at']);
        });

        Schema::table('campaign_messages', function (Blueprint $table) {
            $table->dropIndex(['series_id']);
            $table->dropIndex(['status', 'scheduled_at']);
        });

        Schema::table('series_targets', function (Blueprint $table) {
            $table->dropIndex(['series_id']);
            $table->dropIndex(['group_id']);
        });

        Schema::table('message_translations', function (Blueprint $table) {
            $table->dropIndex(['message_id']);
            $table->dropIndex(['message_id', 'language']);
        });

        Schema::table('message_targets', function (Blueprint $table) {
            $table->dropIndex(['message_id']);
            $table->dropIndex(['group_id']);
        });

        Schema::table('send_logs', function (Blueprint $table) {
            $table->dropIndex(['message_id']);
            $table->dropIndex(['group_id']);
        });
    }
};
