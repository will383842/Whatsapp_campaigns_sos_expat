<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('send_logs', function (Blueprint $table) {
            $table->foreignId('whatsapp_number_id')->nullable()->after('error_message')
                  ->constrained('whatsapp_numbers')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('send_logs', function (Blueprint $table) {
            $table->dropForeign(['whatsapp_number_id']);
            $table->dropColumn('whatsapp_number_id');
        });
    }
};
