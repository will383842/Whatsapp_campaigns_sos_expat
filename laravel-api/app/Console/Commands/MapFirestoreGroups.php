<?php

namespace App\Console\Commands;

use App\Models\Group;
use Illuminate\Console\Command;

/**
 * One-time command to map Laravel groups to Firestore group IDs.
 *
 * The SOS Expat Firestore document (admin_config/whatsapp_groups) uses IDs like
 * "chatter_af_fr", "influencer_lang_en", etc. The Laravel groups table uses raw
 * WhatsApp group IDs (120363xxx). This command creates the mapping between them
 * by matching group names.
 *
 * Usage: php artisan groups:map-firestore [--force]
 */
class MapFirestoreGroups extends Command
{
    protected $signature = 'groups:map-firestore {--force : Overwrite existing mappings}';
    protected $description = 'Map Laravel groups to Firestore group IDs by matching names';

    /**
     * Firestore group ID → display name mapping.
     * Matches the seed data in sos/src/whatsapp-groups/seedWhatsAppGroups.ts
     */
    private const FIRESTORE_GROUPS = [
        // Chatters (14 continent groups)
        'chatter_af_fr' => 'Chatter 🌍 Afrique 🇫🇷',
        'chatter_af_en' => 'Chatter 🌍 Afrique 🇬🇧',
        'chatter_as_fr' => 'Chatter 🌏 Asie 🇫🇷',
        'chatter_as_en' => 'Chatter 🌏 Asie 🇬🇧',
        'chatter_eu_fr' => 'Chatter 🇪🇺 Europe 🇫🇷',
        'chatter_eu_en' => 'Chatter 🇪🇺 Europe 🇬🇧',
        'chatter_na_fr' => 'Chatter 🌎 Amérique du Nord 🇫🇷',
        'chatter_na_en' => 'Chatter 🌎 Amérique du Nord 🇬🇧',
        'chatter_sa_fr' => 'Chatter 🌎 Amérique du Sud 🇫🇷',
        'chatter_sa_en' => 'Chatter 🌎 Amérique du Sud 🇬🇧',
        'chatter_oc_fr' => 'Chatter 🌏 Océanie 🇫🇷',
        'chatter_oc_en' => 'Chatter 🌏 Océanie 🇬🇧',
        'chatter_me_fr' => 'Chatter 🕌 Moyen-Orient 🇫🇷',
        'chatter_me_en' => 'Chatter 🕌 Moyen-Orient 🇬🇧',

        // Influencers (9 language groups)
        'influencer_lang_fr' => 'Influencer Français 🇫🇷',
        'influencer_lang_en' => 'Influencer English 🇬🇧',
        'influencer_lang_es' => 'Influencer Español 🇪🇸',
        'influencer_lang_pt' => 'Influencer Português 🇧🇷',
        'influencer_lang_de' => 'Influencer Deutsch 🇩🇪',
        'influencer_lang_ru' => 'Influencer Russkiy 🇷🇺',
        'influencer_lang_ar' => 'Influencer Al-Arabiyya 🇸🇦',
        'influencer_lang_zh' => 'Influencer Zhongwen 🇨🇳',
        'influencer_lang_hi' => 'Influencer Hindi 🇮🇳',

        // Bloggers (9 language groups)
        'blogger_lang_fr' => 'Blogger Français 🇫🇷',
        'blogger_lang_en' => 'Blogger English 🇬🇧',
        'blogger_lang_es' => 'Blogger Español 🇪🇸',
        'blogger_lang_pt' => 'Blogger Português 🇧🇷',
        'blogger_lang_de' => 'Blogger Deutsch 🇩🇪',
        'blogger_lang_ru' => 'Blogger Russkiy 🇷🇺',
        'blogger_lang_ar' => 'Blogger Al-Arabiyya 🇸🇦',
        'blogger_lang_zh' => 'Blogger Zhongwen 🇨🇳',
        'blogger_lang_hi' => 'Blogger Hindi 🇮🇳',

        // Group Admins (9 language groups)
        'groupAdmin_lang_fr' => 'Group Admin Français 🇫🇷',
        'groupAdmin_lang_en' => 'Group Admin English 🇬🇧',
        'groupAdmin_lang_es' => 'Group Admin Español 🇪🇸',
        'groupAdmin_lang_pt' => 'Group Admin Português 🇧🇷',
        'groupAdmin_lang_de' => 'Group Admin Deutsch 🇩🇪',
        'groupAdmin_lang_ru' => 'Group Admin Russkiy 🇷🇺',
        'groupAdmin_lang_ar' => 'Group Admin Al-Arabiyya 🇸🇦',
        'groupAdmin_lang_zh' => 'Group Admin Zhongwen 🇨🇳',
        'groupAdmin_lang_hi' => 'Group Admin Hindi 🇮🇳',

        // Clients (9 language groups)
        'client_lang_fr' => 'Client Français 🇫🇷',
        'client_lang_en' => 'Client English 🇬🇧',
        'client_lang_es' => 'Client Español 🇪🇸',
        'client_lang_pt' => 'Client Português 🇧🇷',
        'client_lang_de' => 'Client Deutsch 🇩🇪',
        'client_lang_ru' => 'Client Russkiy 🇷🇺',
        'client_lang_ar' => 'Client Al-Arabiyya 🇸🇦',
        'client_lang_zh' => 'Client Zhongwen 🇨🇳',
        'client_lang_hi' => 'Client Hindi 🇮🇳',

        // Lawyers (9 language groups)
        'lawyer_lang_fr' => 'Avocat Français 🇫🇷',
        'lawyer_lang_en' => 'Avocat English 🇬🇧',
        'lawyer_lang_es' => 'Avocat Español 🇪🇸',
        'lawyer_lang_pt' => 'Avocat Português 🇧🇷',
        'lawyer_lang_de' => 'Avocat Deutsch 🇩🇪',
        'lawyer_lang_ru' => 'Avocat Russkiy 🇷🇺',
        'lawyer_lang_ar' => 'Avocat Al-Arabiyya 🇸🇦',
        'lawyer_lang_zh' => 'Avocat Zhongwen 🇨🇳',
        'lawyer_lang_hi' => 'Avocat Hindi 🇮🇳',

        // Expat Helpers (9 language groups)
        'expat_lang_fr' => 'Expatrié Aidant Français 🇫🇷',
        'expat_lang_en' => 'Expatrié Aidant English 🇬🇧',
        'expat_lang_es' => 'Expatrié Aidant Español 🇪🇸',
        'expat_lang_pt' => 'Expatrié Aidant Português 🇧🇷',
        'expat_lang_de' => 'Expatrié Aidant Deutsch 🇩🇪',
        'expat_lang_ru' => 'Expatrié Aidant Russkiy 🇷🇺',
        'expat_lang_ar' => 'Expatrié Aidant Al-Arabiyya 🇸🇦',
        'expat_lang_zh' => 'Expatrié Aidant Zhongwen 🇨🇳',
        'expat_lang_hi' => 'Expatrié Aidant Hindi 🇮🇳',
    ];

    public function handle(): int
    {
        $force = $this->option('force');
        $groups = Group::all();
        $mapped = 0;
        $skipped = 0;
        $notFound = 0;

        // Build a normalized name → firestore_group_id lookup
        $normalizedLookup = [];
        foreach (self::FIRESTORE_GROUPS as $firestoreId => $displayName) {
            $normalizedLookup[$this->normalize($displayName)] = $firestoreId;
        }

        foreach ($groups as $group) {
            // Skip if already mapped and not forcing
            if ($group->firestore_group_id && !$force) {
                $this->line("  SKIP (already mapped): {$group->name} → {$group->firestore_group_id}");
                $skipped++;
                continue;
            }

            $normalized = $this->normalize($group->name);
            $firestoreId = $normalizedLookup[$normalized] ?? null;

            if ($firestoreId) {
                $group->update(['firestore_group_id' => $firestoreId]);
                $this->info("  MAPPED: {$group->name} → {$firestoreId}");
                $mapped++;
            } else {
                $this->warn("  NOT FOUND: {$group->name} (normalized: {$normalized})");
                $notFound++;
            }
        }

        $this->newLine();
        $this->info("Done: {$mapped} mapped, {$skipped} skipped, {$notFound} not found.");

        if ($notFound > 0) {
            $this->warn('Groups not found may be community groups or non-SOS groups in the DB.');
            $this->warn('You can manually set firestore_group_id for them if needed.');
        }

        return self::SUCCESS;
    }

    /**
     * Normalize a group name for fuzzy matching.
     * Strips emojis, extra whitespace, lowercases.
     */
    private function normalize(string $name): string
    {
        // Remove emojis and special unicode characters
        $cleaned = preg_replace('/[\x{1F000}-\x{1FFFF}]/u', '', $name);
        // Remove flag emojis (regional indicator symbols)
        $cleaned = preg_replace('/[\x{1F1E0}-\x{1F1FF}]/u', '', $cleaned);
        // Remove misc symbols
        $cleaned = preg_replace('/[\x{2600}-\x{27BF}]/u', '', $cleaned);
        // Collapse whitespace
        $cleaned = preg_replace('/\s+/', ' ', $cleaned);
        // Trim and lowercase
        return mb_strtolower(trim($cleaned));
    }
}
