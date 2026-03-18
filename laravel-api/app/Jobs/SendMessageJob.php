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
     * Maximum number of unhandled exceptions to allow before failing.
     */
    public int $maxExceptions = 2;

    /**
     * Timeout in seconds.
     */
    public int $timeout = 3600;

    /**
     * Backoff intervals (seconds) between retries.
     */
    public function backoff(): array
    {
        return [30, 60, 120];
    }

    public function __construct(
        public readonly int $messageId
    ) {}

    public function handle(): void
    {
        /** @var CampaignMessage|null $message */
        $message = CampaignMessage::with([
            'series.seriesTargets.group.whatsappNumber',
            'translations',
            'targets.group.whatsappNumber',
        ])->find($this->messageId);

        if (! $message) {
            Log::error("SendMessageJob: message #{$this->messageId} not found.");
            return;
        }

        // Guard: only process pending, sending, or partially_sent
        if (! in_array($message->status, ['pending', 'sending', 'partially_sent'], true)) {
            Log::info("SendMessageJob: message #{$this->messageId} is already {$message->status}, skipping.");
            return;
        }

        // Ensure status is sending
        if (in_array($message->status, ['pending', 'partially_sent'], true)) {
            $message->update(['status' => 'sending']);
        }

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

        // 4. If series is still scheduled, mark as active (first message being sent)
        if ($series->status === 'scheduled') {
            $series->update(['status' => 'active']);
        }
    }

    /**
     * Build the targets array for the Baileys /send payload.
     *
     * IMPORTANT: Re-loads the series fresh from the DB to avoid stale
     * targeting data if the series was modified after the job was dispatched.
     *
     * @return array<int, array{group_wa_id: string, language: string, content: string}>
     */
    private function buildTargets(CampaignMessage $message, \App\Models\CampaignSeries $series): array
    {
        // Re-load series with fresh targeting data from DB (not eager-loaded cache)
        $series = $series->fresh(['seriesTargets.group.whatsappNumber']);
        if (! $series) {
            Log::error("SendMessageJob: series not found for message #{$message->id}.");
            return [];
        }

        $targets = [];
        $targetingMode = $series->targeting_mode;

        Log::info("SendMessageJob: message #{$message->id} — targeting_mode={$targetingMode}, series_targets=" . $series->seriesTargets->pluck('group_id')->implode(','));

        // Index message_targets by group_id for quick lookup
        $messageTargetsByGroupId = $message->targets->keyBy('group_id');

        // Exclude groups already successfully sent (for carry-over retries)
        $alreadySentGroupIds = SendLog::where('message_id', $message->id)
            ->where('status', 'sent')
            ->pluck('group_id')
            ->toArray();

        // Helper: apply category filter to a query builder if target_categories is set
        $categories = $series->target_categories;
        $applyCategories = fn ($query) => ! empty($categories)
            ? $query->whereIn('category', $categories)
            : $query;

        // Resolve group collection based on targeting mode
        $groups = match ($targetingMode) {
            'by_language' => $applyCategories(
                Group::with('whatsappNumber')
                    ->whereIn('language', $series->target_languages ?? [])
                    ->where('is_active', true)
            )->get(),

            'by_group' => Group::with('whatsappNumber')
                ->whereIn('id', $series->seriesTargets->pluck('group_id'))
                ->where('is_active', true)
                ->get(),

            'hybrid' => $applyCategories(
                Group::with('whatsappNumber')
                    ->where(function ($q) use ($series) {
                        $q->whereIn('language', $series->target_languages ?? [])
                          ->orWhereIn('id', $series->seriesTargets->pluck('group_id'));
                    })->where('is_active', true)->distinct()
            )->get(),

            default => collect(),
        };

        Log::info("SendMessageJob: message #{$message->id} — resolved " . $groups->count() . " target groups: " . $groups->pluck('id')->implode(','));

        // Filter out groups already sent
        if (! empty($alreadySentGroupIds)) {
            $groups = $groups->reject(fn ($group) => in_array($group->id, $alreadySentGroupIds));
            Log::info("SendMessageJob: message #{$message->id} — excluded " . count($alreadySentGroupIds) . " already-sent groups.");
        }

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

            $target = [
                'group_wa_id' => $group->whatsapp_group_id,
                'language'    => $language,
                'content'     => $content,
            ];

            // Include assigned instance slug so Baileys uses the correct number
            if ($group->whatsappNumber) {
                $target['instance_slug'] = $group->whatsappNumber->slug;
            }

            $targets[] = $target;
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
