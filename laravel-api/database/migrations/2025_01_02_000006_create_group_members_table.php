<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('group_members', function (Blueprint $table) {
            $table->id();
            $table->foreignId('group_id')->constrained('groups')->onDelete('cascade');
            $table->string('phone', 30)->index();
            $table->string('whatsapp_name')->nullable();
            $table->string('push_name')->nullable();
            $table->boolean('is_admin')->default(false);
            $table->boolean('welcome_sent')->default(false);
            $table->timestamp('joined_at')->nullable();
            $table->timestamp('left_at')->nullable();
            $table->timestamps();

            $table->unique(['group_id', 'phone']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('group_members');
    }
};
