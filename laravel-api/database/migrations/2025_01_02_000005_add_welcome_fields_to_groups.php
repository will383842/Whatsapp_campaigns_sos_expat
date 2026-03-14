<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('groups', function (Blueprint $table) {
            $table->boolean('welcome_enabled')->default(false)->after('is_active');
            $table->text('welcome_message')->nullable()->after('welcome_enabled');
        });
    }

    public function down(): void
    {
        Schema::table('groups', function (Blueprint $table) {
            $table->dropColumn(['welcome_enabled', 'welcome_message']);
        });
    }
};
