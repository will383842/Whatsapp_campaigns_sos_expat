<?php

namespace App\Jobs;

use App\Models\CampaignMessage;
use App\Models\Group;
use App\Models\SendLog;
use GuzzleHttp\Client;
use GuzzleHttp\Exception\RequestException;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;

class SendMessageJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    /**
     * Number of times the job may be attempted.
     */
    public int $tries = 3;

    /**
     * Timeout in seconds.
     */
    public int $timeout = 120;

    public function __construct(
        public readonly int $messageId
    ) {}

    public function handle(): void
    {
        /** @var CampaignMessage|null $message */
        $message = CampaignMessage::with([
            'series.seriesTargets.group',
            'translations',
            'targets.group',
        ])->find($this->messageId);

        if (! $message) {
            Log::error("SendMessageJob: message #{$this->messageId} not found.");
            return;
        }

        // Guard against double dispatch
        if ($message->status !== 'pending') {
            Log::info("SendMessageJob: message #{$this->messageId} is already {$message->status}, skipping.");
            return;
        }

        // Mark as sending
        $message->update(['status' => 'sending']);

        $series = $message->series;
        $baileysUrl = config('baileys.service_url');
        $baileysKey = config('baileys.api_key');

        $client = new Client(['timeout' => 10]);

        // 1. Health check
        try {
            $healthResponse = $client->get("{$baileysUrl}/health", [
                'headers' => ['X-API-Key' => $baileysKey],
            ]);

            $healthData = json_decode($healthResponse->getBody()->getContents(), true);

            if (($healthData['connected'] ?? false) !== true) {
                $this->failMessage($message, 'Baileys service is not connected.');
                $this->fail(new \RuntimeException('Baileys service is not connected.'));
                return;
            }
        } catch (RequestException $e) {
            $this->failMessage($message, 'Baileys health check failed: ' . $e->getMessage());
            $this->fail($e);
            return;
        }

        // 2. Build targets list
        $targets = $this->buildTargets($message, $series);

        if (empty($targets)) {
            Log::warning("SendMessageJob: no targets resolved for message #{$this->messageId}.");
            $message->update(['status' => 'failed']);
            return;
        }

        // 3. Send to Baileys
        try {
            $client->post("{$baileysUrl}/send", [
                'headers' => [
                    'X-API-Key'    => $baileysKey,
                    'Content-Type' => 'application/json',
                    'Accept'       => 'application/json',
                ],
                'json' => [
                    'message_id' => $message->id,
                    'targets'    => $targets,
                ],
            ]);
        } catch (RequestException $e) {
            $this->failMessage($message, 'Baileys send request failed: ' . $e->getMessage());
            $this->fail($e);
            return;
        }

        // 4. If first message in series, mark series as active
        if ($series->status === 'scheduled' && $message->order_index === 0) {
            $series->update(['status' => 'active']);
        }
    }

    /**
     * Build the targets array for the Baileys /send payload.
     *
     * @return array<int, array{group_wa_id: string, language: string, content: string}>
     */
    private function buildTargets(CampaignMessage $message, \App\Models\CampaignSeries $series): array
    {
        $targets = [];
        $targetingMode = $series->targeting_mode;

        // Index message_targets by group_id for quick lookup
        $messageTargetsByGroupId = $message->targets->keyBy('group_id');

        // Resolve group collection
        $groups = match ($targetingMode) {
            'by_language' => Group::whereIn('language', $series->target_languages ?? [])
                ->where('is_active', true)
                ->get(),

            'by_group' => $series->seriesTargets->map->group->filter(),

            'hybrid' => Group::where(function ($q) use ($series) {
                $q->whereIn('language', $series->target_languages ?? [])
                  ->orWhereIn('id', $series->seriesTargets->pluck('group_id'));
            })->where('is_active', true)->distinct()->get(),

            default => collect(),
        };

        foreach ($groups as $group) {
            // Prefer custom_content from message_target, otherwise use translation for group's language
            $messageTarget = $messageTargetsByGroupId->get($group->id);

            if ($messageTarget && ! empty($messageTarget->custom_content)) {
                $content = $messageTarget->custom_content;
                $language = $group->language;
            } else {
                $translation = $message->getTranslationForLanguage($group->language);

                // Fallback to source language if no translation for group's language
                if (! $translation && $series->source_language && $series->source_language !== $group->language) {
                    $translation = $message->getTranslationForLanguage($series->source_language);
                }

                if (! $translation) {
                    Log::warning("SendMessageJob: no translation found for language '{$group->language}' (and no source fallback) for message #{$message->id}, group #{$group->id}. Skipping group.");
                    continue;
                }

                $content  = $translation->content;
                $language = $group->language;
            }

            $targets[] = [
                'group_wa_id' => $group->whatsapp_group_id,
                'language'    => $language,
                'content'     => $content,
            ];
        }

        return $targets;
    }

    /**
     * Mark a message as failed and log the reason.
     */
    private function failMessage(CampaignMessage $message, string $reason): void
    {
        $message->update(['status' => 'failed']);
        Log::error("SendMessageJob: message #{$message->id} failed — {$reason}");
    }

    /**
     * Called when all retries are exhausted.
     */
    public function failed(\Throwable $e): void
    {
        $message = CampaignMessage::find($this->messageId);

        if ($message) {
            $message->update(['status' => 'failed']);
        }

        Log::error("SendMessageJob: permanently failed for message #{$this->messageId} — {$e->getMessage()}");
    }
}
