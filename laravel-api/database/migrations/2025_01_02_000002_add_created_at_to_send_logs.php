<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('send_logs', function (Blueprint $table) {
            $table->timestamp('created_at')->useCurrent()->after('error_message');
        });
    }

    public function down(): void
    {
        Schema::table('send_logs', function (Blueprint $table) {
            $table->dropColumn('created_at');
        });
    }
};
