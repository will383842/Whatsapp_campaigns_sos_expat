<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        User::factory()->create([
            'name'     => 'Williams Jullin',
            'email'    => 'williams@sos-expat.com',
            'password' => bcrypt('Campaigns2025!'),
            'role'     => 'admin',
            'locale'   => 'fr',
        ]);
    }
}
