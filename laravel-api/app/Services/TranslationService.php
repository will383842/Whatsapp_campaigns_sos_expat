<?php

namespace App\Services;

use App\Models\CampaignSeries;
use App\Models\MessageTranslation;
use Illuminate\Support\Facades\Log;
use OpenAI\Laravel\Facades\OpenAI;

class TranslationService
{
    /**
     * Language names in their native form for the prompt.
     */
    private const NATIVE_LANG_NAMES = [
        'fr' => 'Fran\u00e7ais',
        'en' => 'English',
        'de' => 'Deutsch',
        'pt' => 'Portugu\u00eas',
        'es' => 'Espa\u00f1ol',
        'it' => 'Italiano',
        'nl' => 'Nederlands',
        'ar' => '\u0627\u0644\u0639\u0631\u0628\u064a\u0629',
        'zh' => '\u4e2d\u6587',
        'ru' => '\u0420\u0443\u0441\u0441\u043a\u0438\u0439',
    ];

    /**
     * Enhance the source message: polish the text, add relevant emojis,
     * make it engaging and fun for WhatsApp while keeping the original meaning.
     */
    public function enhanceMessage(string $content, string $language): string
    {
        $langName = self::NATIVE_LANG_NAMES[$language] ?? $language;

        $systemPrompt = <<<PROMPT
Tu es un expert en communication WhatsApp pour SOS-Expat, une communaut\u00e9 internationale d'entraide entre expatri\u00e9s et avocats.

Ta mission : am\u00e9liorer ce message WhatsApp en {$langName} pour le rendre ENGAGEANT et PROFESSIONNEL.

R\u00e8gles :
1. GARDE le sens et les informations cl\u00e9s du message original intact.
2. Ajoute des emojis pertinents et bien plac\u00e9s (\u{1F680}\u{2728}\u{1F4AA}\u{1F31F}\u{1F389} etc.) — pas trop, juste ce qu'il faut pour rendre le message vivant.
3. Utilise le formatage WhatsApp : *gras* pour les mots importants, _italique_ pour l'emphase.
4. Ton : chaleureux, fun, dynamique, communautaire. Comme un message entre amis, pas un email corporate.
5. Structure claire avec des sauts de ligne pour a\u00e9rer le texte.
6. Si le message est court, garde-le court. Ne rallonge pas inutilement.
7. Renvoie UNIQUEMENT le message am\u00e9lior\u00e9. Aucun commentaire, aucune explication.
PROMPT;

        $response = OpenAI::chat()->create([
            'model' => 'gpt-4o',
            'messages' => [
                ['role' => 'system', 'content' => $systemPrompt],
                ['role' => 'user', 'content' => $content],
            ],
            'temperature' => 0.7,
            'max_tokens' => 1024,
        ]);

        return trim($response->choices[0]->message->content ?? '');
    }

    /**
     * Translate a WhatsApp message content from one language to another.
     * The result reads as if a native speaker WROTE it, not translated it.
     */
    public function translateMessage(string $content, string $fromLang, string $toLang): string
    {
        $fromName = self::NATIVE_LANG_NAMES[$fromLang] ?? $fromLang;
        $toName = self::NATIVE_LANG_NAMES[$toLang] ?? $toLang;

        $systemPrompt = <<<PROMPT
Tu es un r\u00e9dacteur natif {$toName} sp\u00e9cialis\u00e9 dans la communication WhatsApp pour une communaut\u00e9 internationale d'expatri\u00e9s (SOS-Expat).

Ta mission : r\u00e9\u00e9crire ce message en {$toName} comme si tu l'\u00e9crivais toi-m\u00eame pour TA communaut\u00e9 locale. Ce n'est PAS une traduction, c'est une r\u00e9daction native.

R\u00e8gles :
1. \u00c9cris comme un NATIF {$toName} \u00e9crirait sur WhatsApp — expressions idiomatiques, tournures naturelles, r\u00e9f\u00e9rences culturelles locales si pertinent.
2. Conserve TOUS les emojis et ajoutes-en si c'est naturel dans la culture {$toName}.
3. Conserve le formatage WhatsApp : *gras*, _italique_, ~barr\u00e9~.
4. Conserve les sauts de ligne et la structure du message.
5. Ton : chaleureux, fun, dynamique, communautaire — adapt\u00e9 \u00e0 la culture {$toName}.
6. NE traduis PAS mot-\u00e0-mot. Adapte les expressions, l'humour, le ton.
7. Garde la m\u00eame longueur approximative que l'original.
8. Renvoie UNIQUEMENT le message en {$toName}. Aucun commentaire.

Message original en {$fromName} :
PROMPT;

        $response = OpenAI::chat()->create([
            'model' => 'gpt-4o',
            'messages' => [
                ['role' => 'system', 'content' => $systemPrompt],
                ['role' => 'user', 'content' => $content],
            ],
            'temperature' => 0.6,
            'max_tokens' => 1024,
        ]);

        return trim($response->choices[0]->message->content ?? '');
    }

    /**
     * Translate all messages in a series into each of the given target languages.
     *
     * For each message × language combination:
     *  - Creates or updates a MessageTranslation record with translated_by = 'gpt4o'
     *
     * @param  CampaignSeries  $series
     * @param  string[]        $targetLanguages  Array of BCP-47 language codes
     * @return array{succeeded: int, failed: array<int, array{message_id: int, language: string, error: string}>}
     */
    public function translateSeries(CampaignSeries $series, array $targetLanguages): array
    {
        $sourceLang = $series->source_language ?? 'fr';
        $messages = $series->messages()->with('translations')->get();

        $succeeded = 0;
        $errors = [];

        foreach ($messages as $message) {
            // Find the source translation
            $sourceTranslation = $message->getTranslationForLanguage($sourceLang);

            if (! $sourceTranslation) {
                Log::warning("TranslationService: no source translation ({$sourceLang}) for message #{$message->id}, skipping.");
                $errors[] = [
                    'message_id' => $message->id,
                    'language'   => $sourceLang,
                    'error'      => "No source translation found for language '{$sourceLang}'",
                ];
                continue;
            }

            // Step 1: Enhance the source message (add emojis, polish, make it fun)
            try {
                $enhanced = $this->enhanceMessage($sourceTranslation->content, $sourceLang);
                $sourceTranslation->update([
                    'content'       => $enhanced,
                    'translated_by' => 'gpt4o',
                ]);
                Log::info("TranslationService: enhanced source message #{$message->id} ({$sourceLang}).");
            } catch (\Throwable $e) {
                Log::warning("TranslationService: failed to enhance source message #{$message->id}: {$e->getMessage()}. Using original.");
                $enhanced = $sourceTranslation->content;
            }

            // Step 2: Create native versions for each target language
            foreach ($targetLanguages as $targetLang) {
                if ($targetLang === $sourceLang) {
                    continue;
                }

                try {
                    $translated = $this->translateMessage(
                        $enhanced,
                        $sourceLang,
                        $targetLang
                    );

                    MessageTranslation::updateOrCreate(
                        [
                            'message_id' => $message->id,
                            'language'   => $targetLang,
                        ],
                        [
                            'content'        => $translated,
                            'translated_by'  => 'gpt4o',
                        ]
                    );

                    $succeeded++;
                } catch (\Throwable $e) {
                    Log::error("TranslationService: failed to translate message #{$message->id} to {$targetLang}: {$e->getMessage()}");
                    $errors[] = [
                        'message_id' => $message->id,
                        'language'   => $targetLang,
                        'error'      => $e->getMessage(),
                    ];
                }
            }
        }

        return [
            'succeeded' => $succeeded,
            'failed'    => $errors,
        ];
    }
}
