<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // 1. Add 'partially_sent' to campaign_messages status enum
        DB::statement("ALTER TABLE campaign_messages MODIFY COLUMN status ENUM('pending', 'sending', 'sent', 'failed', 'partially_sent') NOT NULL DEFAULT 'pending'");

        // 2. Add original_scheduled_at to campaign_messages
        Schema::table('campaign_messages', function (Blueprint $table) {
            $table->timestamp('original_scheduled_at')->nullable()->after('scheduled_at');
        });

        // 3. Add 'quota_exceeded' to send_logs status enum
        DB::statement("ALTER TABLE send_logs MODIFY COLUMN status ENUM('sent', 'failed', 'quota_exceeded') NOT NULL");
    }

    public function down(): void
    {
        // Remove quota_exceeded logs first to avoid data loss on enum shrink
        DB::table('send_logs')->where('status', 'quota_exceeded')->delete();
        DB::statement("ALTER TABLE send_logs MODIFY COLUMN status ENUM('sent', 'failed') NOT NULL");

        // Remove partially_sent messages
        DB::table('campaign_messages')->where('status', 'partially_sent')->update(['status' => 'failed']);
        DB::statement("ALTER TABLE campaign_messages MODIFY COLUMN status ENUM('pending', 'sending', 'sent', 'failed') NOT NULL DEFAULT 'pending'");

        Schema::table('campaign_messages', function (Blueprint $table) {
            $table->dropColumn('original_scheduled_at');
        });
    }
};
