<?php

namespace App\Services;

use App\Models\CampaignSeries;
use App\Models\MessageTranslation;
use Illuminate\Support\Facades\Log;
use OpenAI\Laravel\Facades\OpenAI;

class TranslationService
{
    /**
     * Translate a WhatsApp message content from one language to another.
     *
     * Preserves:
     * - WhatsApp formatting markers (*bold*, _italic_, ~strikethrough~)
     * - Emojis
     * - Line breaks
     *
     * @param  string  $content   The source message text
     * @param  string  $fromLang  BCP-47 language code of the source (e.g. 'fr', 'en')
     * @param  string  $toLang    BCP-47 language code of the target
     * @return string             Translated text
     */
    public function translateMessage(string $content, string $fromLang, string $toLang): string
    {
        $systemPrompt = <<<PROMPT
You are a professional translator specializing in WhatsApp messages for the SOS Expat international community.

Rules:
1. Translate from {$fromLang} to {$toLang}.
2. Preserve ALL WhatsApp formatting markers exactly as-is: *bold*, _italic_, ~strikethrough~.
3. Preserve ALL emojis exactly in their original position.
4. Preserve ALL line breaks (\n) exactly.
5. Use an informal, warm, community-friendly WhatsApp tone.
6. Adapt culturally for the target language audience — do not translate word-for-word.
7. Return ONLY the translated text. No explanations, no comments, no extra lines.
PROMPT;

        $response = OpenAI::chat()->create([
            'model' => 'gpt-4o',
            'messages' => [
                ['role' => 'system', 'content' => $systemPrompt],
                ['role' => 'user', 'content' => $content],
            ],
            'temperature' => 0.3,
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
     */
    public function translateSeries(CampaignSeries $series, array $targetLanguages): void
    {
        $sourceLang = $series->source_language ?? 'fr';
        $messages = $series->messages()->with('translations')->get();

        foreach ($messages as $message) {
            // Find the source translation
            $sourceTranslation = $message->getTranslationForLanguage($sourceLang);

            if (! $sourceTranslation) {
                Log::warning("TranslationService: no source translation ({$sourceLang}) for message #{$message->id}, skipping.");
                continue;
            }

            foreach ($targetLanguages as $targetLang) {
                if ($targetLang === $sourceLang) {
                    continue;
                }

                try {
                    $translated = $this->translateMessage(
                        $sourceTranslation->content,
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
                } catch (\Throwable $e) {
                    Log::error("TranslationService: failed to translate message #{$message->id} to {$targetLang}: {$e->getMessage()}");
                }
            }
        }
    }
}
