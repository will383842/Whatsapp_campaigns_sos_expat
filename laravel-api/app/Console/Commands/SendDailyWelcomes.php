<?php

namespace App\Console\Commands;

use App\Models\Group;
use App\Models\GroupMember;
use GuzzleHttp\Client;
use GuzzleHttp\Exception\RequestException;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

class SendDailyWelcomes extends Command
{
    protected $signature = 'welcome:send-batch';

    protected $description = 'Send ONE batch welcome message per group for all new members who joined since last send.';

    /**
     * Default batch welcome messages by language.
     * {names} = comma-separated list of new member names.
     * {group_name} = group display name.
     * {count} = number of new members.
     */
    private const BATCH_MESSAGES = [
        'fr' => "Bienvenue \xC3\xA0 nos nouveaux membres ! \xF0\x9F\x91\x8B\xE2\x9C\xA8\n\n{names}\n\nRavi(e)s de vous accueillir dans *{group_name}* \xF0\x9F\x8E\x89\n\nN'h\xC3\xA9sitez pas \xC3\xA0 vous pr\xC3\xA9senter et \xC3\xA0 poser vos questions, on est l\xC3\xA0 pour s'entraider ! \xF0\x9F\x92\xAA",
        'en' => "Welcome to our new members! \xF0\x9F\x91\x8B\xE2\x9C\xA8\n\n{names}\n\nGreat to have you all in *{group_name}* \xF0\x9F\x8E\x89\n\nFeel free to introduce yourselves and ask any questions \xe2\x80\x94 we're here to help! \xF0\x9F\x92\xAA",
        'de' => "Willkommen an unsere neuen Mitglieder! \xF0\x9F\x91\x8B\xE2\x9C\xA8\n\n{names}\n\nSch\xC3\xB6n, dass ihr bei *{group_name}* dabei seid \xF0\x9F\x8E\x89\n\nStellt euch gerne vor und fragt was ihr m\xC3\xB6chtet \xe2\x80\x94 wir helfen uns gegenseitig! \xF0\x9F\x92\xAA",
        'pt' => "Bem-vindos aos nossos novos membros! \xF0\x9F\x91\x8B\xE2\x9C\xA8\n\n{names}\n\n\xC3\x93timo ter voc\xC3\xAAs no *{group_name}* \xF0\x9F\x8E\x89\n\nSintam-se \xC3\xA0 vontade para se apresentar e tirar d\xC3\xBAvidas \xe2\x80\x94 estamos aqui para ajudar! \xF0\x9F\x92\xAA",
        'es' => "\xC2\xA1Bienvenidos a nuestros nuevos miembros! \xF0\x9F\x91\x8B\xE2\x9C\xA8\n\n{names}\n\nQu\xC3\xA9 bueno tenerlos en *{group_name}* \xF0\x9F\x8E\x89\n\nPres\xC3\xA9ntense y pregunten lo que necesiten \xe2\x80\x94 \xC2\xA1estamos para ayudarnos! \xF0\x9F\x92\xAA",
        'it' => "Benvenuti ai nostri nuovi membri! \xF0\x9F\x91\x8B\xE2\x9C\xA8\n\n{names}\n\nBello avervi nel *{group_name}* \xF0\x9F\x8E\x89\n\nPresentatevi e chiedete pure \xe2\x80\x94 siamo qui per aiutarci! \xF0\x9F\x92\xAA",
        'nl' => "Welkom aan onze nieuwe leden! \xF0\x9F\x91\x8B\xE2\x9C\xA8\n\n{names}\n\nFijn dat jullie bij *{group_name}* zijn \xF0\x9F\x8E\x89\n\nStel je gerust voor en stel je vragen \xe2\x80\x94 we helpen elkaar! \xF0\x9F\x92\xAA",
        'ar' => "\xD9\x85\xD8\xB1\xD8\xAD\xD8\xA8\xD8\xA7 \xD8\xA8\xD8\xA3\xD8\xB9\xD8\xB6\xD8\xA7\xD8\xA6\xD9\x86\xD8\xA7 \xD8\xA7\xD9\x84\xD8\xAC\xD8\xAF\xD8\xAF! \xF0\x9F\x91\x8B\xE2\x9C\xA8\n\n{names}\n\n\xD8\xB3\xD8\xB9\xD8\xAF\xD8\xA7\xD8\xA1 \xD8\xA8\xD8\xA7\xD9\x86\xD8\xB6\xD9\x85\xD8\xA7\xD9\x85\xD9\x83\xD9\x85 \xD8\xA5\xD9\x84\xD9\x89 *{group_name}* \xF0\x9F\x8E\x89\n\n\xD9\x84\xD8\xA7 \xD8\xAA\xD8\xAA\xD8\xB1\xD8\xAF\xD8\xAF\xD9\x88\xD8\xA7 \xD9\x81\xD9\x8A \xD8\xA7\xD9\x84\xD8\xAA\xD8\xB9\xD8\xB1\xD9\x8A\xD9\x81 \xD8\xA8\xD8\xA3\xD9\x86\xD9\x81\xD8\xB3\xD9\x83\xD9\x85 \xD9\x88\xD8\xB7\xD8\xB1\xD8\xAD \xD8\xA3\xD8\xB3\xD8\xA6\xD9\x84\xD8\xAA\xD9\x83\xD9\x85 \xF0\x9F\x92\xAA",
        'zh' => "\xE6\xAC\xA2\xE8\xBF\x8E\xE6\x88\x91\xE4\xBB\xAC\xE7\x9A\x84\xE6\x96\xB0\xE6\x88\x90\xE5\x91\x98\xEF\xBC\x81\xF0\x9F\x91\x8B\xE2\x9C\xA8\n\n{names}\n\n\xE5\xBE\x88\xE9\xAB\x98\xE5\x85\xB4\xE4\xBD\xA0\xE4\xBB\xAC\xE5\x8A\xA0\xE5\x85\xA5 *{group_name}* \xF0\x9F\x8E\x89\n\n\xE8\xAF\xB7\xE9\x9A\x8F\xE6\x97\xB6\xE8\x87\xAA\xE6\x88\x91\xE4\xBB\x8B\xE7\xBB\x8D\xE5\x92\x8C\xE6\x8F\x90\xE9\x97\xAE\xEF\xBC\x8C\xE6\x88\x91\xE4\xBB\xAC\xE4\xBA\x92\xE7\x9B\xB8\xE5\xB8\xAE\xE5\x8A\xA9\xEF\xBC\x81\xF0\x9F\x92\xAA",
        'ru' => "\xD0\x94\xD0\xBE\xD0\xB1\xD1\x80\xD0\xBE \xD0\xBF\xD0\xBE\xD0\xB6\xD0\xB0\xD0\xBB\xD0\xBE\xD0\xB2\xD0\xB0\xD1\x82\xD1\x8C \xD0\xBD\xD0\xB0\xD1\x88\xD0\xB8\xD0\xBC \xD0\xBD\xD0\xBE\xD0\xB2\xD1\x8B\xD0\xBC \xD1\x83\xD1\x87\xD0\xB0\xD1\x81\xD1\x82\xD0\xBD\xD0\xB8\xD0\xBA\xD0\xB0\xD0\xBC! \xF0\x9F\x91\x8B\xE2\x9C\xA8\n\n{names}\n\n\xD0\xA0\xD0\xB0\xD0\xB4\xD1\x8B \xD0\xB2\xD0\xB8\xD0\xB4\xD0\xB5\xD1\x82\xD1\x8C \xD0\xB2\xD0\xB0\xD1\x81 \xD0\xB2 *{group_name}* \xF0\x9F\x8E\x89\n\n\xD0\x9F\xD1\x80\xD0\xB5\xD0\xB4\xD1\x81\xD1\x82\xD0\xB0\xD0\xB2\xD1\x8C\xD1\x82\xD0\xB5\xD1\x81\xD1\x8C \xD0\xB8 \xD0\xB7\xD0\xB0\xD0\xB4\xD0\xB0\xD0\xB2\xD0\xB0\xD0\xB9\xD1\x82\xD0\xB5 \xD0\xB2\xD0\xBE\xD0\xBF\xD1\x80\xD0\xBE\xD1\x81\xD1\x8B \xe2\x80\x94 \xD0\xBC\xD1\x8B \xD0\xBF\xD0\xBE\xD0\xBC\xD0\xBE\xD0\xB3\xD0\xB0\xD0\xB5\xD0\xBC \xD0\xB4\xD1\x80\xD1\x83\xD0\xB3 \xD0\xB4\xD1\x80\xD1\x83\xD0\xB3\xD1\x83! \xF0\x9F\x92\xAA",
    ];

    public function handle(): int
    {
        $baileysUrl = config('baileys.service_url');
        $baileysKey = config('baileys.api_key');

        $client = new Client(['timeout' => 30]);

        // 1. Health check — skip if Baileys is disconnected
        try {
            $health = $client->get("{$baileysUrl}/health");
            $data = json_decode($health->getBody()->getContents(), true);

            if (! ($data['connected'] ?? false)) {
                $this->warn('Baileys is not connected — skipping batch welcomes. Will retry next run.');
                Log::warning('welcome:send-batch — Baileys not connected, skipping.');
                return self::SUCCESS;
            }
        } catch (RequestException $e) {
            $this->error('Baileys health check failed: ' . $e->getMessage());
            Log::error('welcome:send-batch — health check failed: ' . $e->getMessage());
            return self::FAILURE;
        }

        // 2. Find all new members who haven't been welcomed yet (and haven't left)
        $pendingMembers = GroupMember::where('welcome_sent', false)
            ->whereNull('left_at')
            ->with('group')
            ->get();

        if ($pendingMembers->isEmpty()) {
            $this->info('No pending welcome messages.');
            return self::SUCCESS;
        }

        // 3. Group by group_id
        $grouped = $pendingMembers->groupBy('group_id');

        $totalGroups = $grouped->count();
        $totalMembers = $pendingMembers->count();
        $sentGroups = 0;
        $failedGroups = 0;

        $this->info("Found {$totalMembers} new member(s) across {$totalGroups} group(s).");
        Log::info("welcome:send-batch — {$totalMembers} members across {$totalGroups} groups.");

        foreach ($grouped as $groupId => $members) {
            $group = $members->first()->group;

            if (! $group || ! $group->is_active || ! $group->welcome_enabled) {
                // Mark as sent to avoid re-processing groups with welcome disabled
                GroupMember::whereIn('id', $members->pluck('id'))
                    ->update(['welcome_sent' => true]);

                $this->line("  Skipped group #{$groupId} (inactive or welcome disabled) — {$members->count()} member(s) marked.");
                continue;
            }

            // 4. Build the batch message
            $names = $members->map(fn ($m) => $m->display_name)->toArray();
            $namesList = implode(', ', $names);

            $template = $group->welcome_message
                ? $this->adaptCustomTemplate($group->welcome_message, $names)
                : (self::BATCH_MESSAGES[$group->language] ?? self::BATCH_MESSAGES['en']);

            $message = str_replace(
                ['{names}', '{group_name}', '{count}'],
                [$namesList, $group->name, (string) count($names)],
                $template
            );

            // 5. Send via Baileys
            try {
                $response = $client->post("{$baileysUrl}/send/welcome", [
                    'headers' => [
                        'X-API-Key'    => $baileysKey,
                        'Content-Type' => 'application/json',
                    ],
                    'json' => [
                        'group_wa_id' => $group->whatsapp_group_id,
                        'content'     => $message,
                    ],
                ]);

                $result = json_decode($response->getBody()->getContents(), true);

                if ($result['success'] ?? false) {
                    // Mark all members as welcomed
                    GroupMember::whereIn('id', $members->pluck('id'))
                        ->update(['welcome_sent' => true]);

                    $sentGroups++;
                    $this->line("  Sent batch welcome to {$group->name} ({$members->count()} member(s))");
                    Log::info("welcome:send-batch — sent to group #{$groupId} ({$group->name}), {$members->count()} members.");
                } else {
                    $failedGroups++;
                    $this->error("  Failed to send to {$group->name}: " . ($result['error'] ?? 'unknown'));
                    Log::error("welcome:send-batch — failed for group #{$groupId}: " . ($result['error'] ?? 'unknown'));
                }
            } catch (RequestException $e) {
                $failedGroups++;
                $this->error("  Failed to send to {$group->name}: " . $e->getMessage());
                Log::error("welcome:send-batch — request failed for group #{$groupId}: " . $e->getMessage());
            }
        }

        $this->info("Batch welcome complete: {$sentGroups} sent, {$failedGroups} failed.");
        Log::info("welcome:send-batch — done: {$sentGroups} sent, {$failedGroups} failed.");

        return self::SUCCESS;
    }

    /**
     * If the group has a custom welcome template (designed for single member),
     * adapt it for batch by replacing {name} with a comma-separated list.
     */
    private function adaptCustomTemplate(string $template, array $names): string
    {
        $namesList = implode(', ', $names);
        return str_replace('{name}', $namesList, $template);
    }
}
