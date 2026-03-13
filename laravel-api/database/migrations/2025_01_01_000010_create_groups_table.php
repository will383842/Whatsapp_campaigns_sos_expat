<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('groups', function (Blueprint $table) {
            $table->id();
            $table->string('whatsapp_group_id', 100)->unique();
            $table->string('name');
            $table->string('language', 10);
            $table->string('country')->nullable();
            $table->string('continent')->nullable();
            $table->unsignedInteger('member_count')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('groups');
    }
};
