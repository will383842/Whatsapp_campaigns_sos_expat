<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // 1. Add category column
        Schema::table('groups', function (Blueprint $table) {
            $table->string('category', 30)->nullable()->after('language');
        });

        // 2. Add target_categories to campaign_series
        Schema::table('campaign_series', function (Blueprint $table) {
            $table->json('target_categories')->nullable()->after('target_languages');
        });

        // 3. Backfill category from community_name
        $mapping = [
            'Chatters'           => 'chatter',
            'Clients'            => 'client',
            'Avocats'            => 'avocat',
            'Bloggers'           => 'blogger',
            'Influencers'        => 'influencer',
            'Group Admins'       => 'group_admin',
            'Expatriés Aidants'  => 'expatrie_aidant',
        ];

        foreach ($mapping as $keyword => $category) {
            DB::table('groups')
                ->where('community_name', 'LIKE', "%{$keyword}%")
                ->update(['category' => $category]);
        }

        // 4. Fix Hindi groups wrongly tagged as 'fr'
        DB::table('groups')
            ->where('name', 'LIKE', '%Hindi%')
            ->where('language', 'fr')
            ->update(['language' => 'hi']);

        // 5. Add index
        Schema::table('groups', function (Blueprint $table) {
            $table->index('category');
        });
    }

    public function down(): void
    {
        Schema::table('groups', function (Blueprint $table) {
            $table->dropIndex(['category']);
            $table->dropColumn('category');
        });

        Schema::table('campaign_series', function (Blueprint $table) {
            $table->dropColumn('target_categories');
        });

        // Revert Hindi language fix
        DB::table('groups')
            ->where('name', 'LIKE', '%Hindi%')
            ->where('language', 'hi')
            ->update(['language' => 'fr']);
    }
};
