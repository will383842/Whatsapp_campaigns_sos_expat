<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('whatsapp_numbers', function (Blueprint $table) {
            $table->id();
            $table->string('slug', 50)->unique();
            $table->string('name', 100);
            $table->string('phone', 20);
            $table->enum('status', ['active', 'paused', 'banned', 'disconnected'])->default('disconnected');
            $table->boolean('is_default')->default(false);
            $table->boolean('is_rotation_enabled')->default(true);
            $table->integer('daily_max')->default(50);
            $table->integer('daily_sent')->default(0);
            $table->integer('messages_total')->default(0);
            $table->integer('ban_count')->default(0);
            $table->timestamp('last_connected_at')->nullable();
            $table->text('last_error')->nullable();
            $table->timestamps();
        });

        // Seed initial data
        \DB::table('whatsapp_numbers')->insert([
            [
                'slug' => 'default',
                'name' => 'SOS-Expat Principal',
                'phone' => '33743331201',
                'status' => 'active',
                'is_default' => true,
                'is_rotation_enabled' => true,
                'daily_max' => 50,
                'daily_sent' => 0,
                'messages_total' => 0,
                'ban_count' => 0,
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'slug' => 'sim-2',
                'name' => 'SIM Free #1',
                'phone' => '33743613873',
                'status' => 'disconnected',
                'is_default' => false,
                'is_rotation_enabled' => true,
                'daily_max' => 50,
                'daily_sent' => 0,
                'messages_total' => 0,
                'ban_count' => 0,
                'created_at' => now(),
                'updated_at' => now(),
            ],
        ]);
    }

    public function down(): void
    {
        Schema::dropIfExists('whatsapp_numbers');
    }
};
