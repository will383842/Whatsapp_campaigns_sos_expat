<?php

namespace App\Services;

class WhatsAppFormatterService
{
    /**
     * Format text for WhatsApp delivery.
     * - Strips HTML tags (WhatsApp does not support HTML)
     * - Validates that WhatsApp formatting markers (*bold*, _italic_, ~strikethrough~) are properly paired
     * - Returns clean text safe for WhatsApp
     */
    public function formatForWhatsApp(string $text): string
    {
        // Strip HTML tags
        $text = strip_tags($text);

        // Decode HTML entities (e.g. &amp; &lt;)
        $text = html_entity_decode($text, ENT_QUOTES | ENT_HTML5, 'UTF-8');

        // Validate paired formatting markers and warn in logs if malformed
        $this->validateFormattingMarkers($text);

        // Normalise line endings
        $text = str_replace("\r\n", "\n", $text);
        $text = str_replace("\r", "\n", $text);

        return trim($text);
    }

    /**
     * Count characters in a string.
     * Emoji characters are counted as 2 characters (as WhatsApp does).
     */
    public function countCharacters(string $text): int
    {
        $count = 0;
        $graphemes = preg_split('//u', $text, -1, PREG_SPLIT_NO_EMPTY);

        if ($graphemes === false) {
            return mb_strlen($text, 'UTF-8');
        }

        foreach ($graphemes as $char) {
            $codepoint = mb_ord($char, 'UTF-8');

            // Emoji ranges: Emoticons, Misc symbols, Dingbats, Supplemental symbols, etc.
            if ($this->isEmoji($codepoint)) {
                $count += 2;
            } else {
                $count += 1;
            }
        }

        return $count;
    }

    /**
     * Validate that WhatsApp formatting markers are properly paired.
     * Logs a warning if markers appear to be unmatched.
     */
    private function validateFormattingMarkers(string $text): void
    {
        $markers = [
            '*' => 'bold',
            '_' => 'italic',
            '~' => 'strikethrough',
        ];

        foreach ($markers as $marker => $type) {
            $escaped = preg_quote($marker, '/');
            $matches = preg_match_all('/' . $escaped . '/', $text);

            if ($matches !== false && $matches % 2 !== 0) {
                \Log::warning("WhatsApp formatter: Unmatched {$type} marker ({$marker}) detected in message.", [
                    'text_preview' => mb_substr($text, 0, 100),
                ]);
            }
        }
    }

    /**
     * Determine whether a Unicode codepoint is an emoji.
     */
    private function isEmoji(int $codepoint): bool
    {
        return (
            // Emoticons block
            ($codepoint >= 0x1F600 && $codepoint <= 0x1F64F) ||
            // Misc Symbols and Pictographs
            ($codepoint >= 0x1F300 && $codepoint <= 0x1F5FF) ||
            // Transport and Map Symbols
            ($codepoint >= 0x1F680 && $codepoint <= 0x1F6FF) ||
            // Supplemental Symbols and Pictographs
            ($codepoint >= 0x1F900 && $codepoint <= 0x1F9FF) ||
            // Symbols and Pictographs Extended-A
            ($codepoint >= 0x1FA00 && $codepoint <= 0x1FA9F) ||
            // Dingbats
            ($codepoint >= 0x2702 && $codepoint <= 0x27B0) ||
            // Enclosed characters
            ($codepoint >= 0x24C2 && $codepoint <= 0x1F251) ||
            // Regional indicator symbols (flags)
            ($codepoint >= 0x1F1E0 && $codepoint <= 0x1F1FF) ||
            // Miscellaneous Symbols
            ($codepoint >= 0x2600 && $codepoint <= 0x26FF)
        );
    }
}
