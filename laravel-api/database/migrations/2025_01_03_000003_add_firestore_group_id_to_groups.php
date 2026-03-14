<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('groups', function (Blueprint $table) {
            $table->string('firestore_group_id', 100)->nullable()->after('invite_link');
            $table->index('firestore_group_id');
        });
    }

    public function down(): void
    {
        Schema::table('groups', function (Blueprint $table) {
            $table->dropIndex(['firestore_group_id']);
            $table->dropColumn('firestore_group_id');
        });
    }
};
