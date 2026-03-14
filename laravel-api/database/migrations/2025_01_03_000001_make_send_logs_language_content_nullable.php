<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('send_logs', function (Blueprint $table) {
            $table->string('language', 10)->nullable()->default('')->change();
            $table->text('content_sent')->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('send_logs', function (Blueprint $table) {
            $table->string('language', 10)->nullable(false)->default(null)->change();
            $table->text('content_sent')->nullable(false)->change();
        });
    }
};
