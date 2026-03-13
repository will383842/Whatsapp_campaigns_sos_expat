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
            'email'    => 'williamsjullin@gmail.com',
            'password' => bcrypt('MJJsblanc19522008/*%$'),
            'role'     => 'admin',
            'locale'   => 'fr',
        ]);
    }
}
