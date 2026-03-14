<?php

namespace App\Http\Controllers;

use App\Models\Group;
use App\Models\GroupMember;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class WelcomeController extends Controller
{
    /**
     * Default welcome messages by language.
     */
    private const DEFAULT_MESSAGES = [
        'fr' => "Bienvenue {name} ! \xF0\x9F\x91\x8B\xE2\x9C\xA8\n\nRavi(e) de t'accueillir dans *{group_name}* \xF0\x9F\x8E\x89\n\nN'h\xC3\xA9site pas \xC3\xA0 te pr\xC3\xA9senter et \xC3\xA0 poser tes questions, on est l\xC3\xA0 pour s'entraider ! \xF0\x9F\x92\xAA",
        'en' => "Welcome {name}! \xF0\x9F\x91\x8B\xE2\x9C\xA8\n\nGreat to have you in *{group_name}* \xF0\x9F\x8E\x89\n\nFeel free to introduce yourself and ask any questions \xe2\x80\x94 we're here to help! \xF0\x9F\x92\xAA",
        'de' => "Willkommen {name}! \xF0\x9F\x91\x8B\xE2\x9C\xA8\n\nSch\xC3\xB6n, dass du bei *{group_name}* dabei bist \xF0\x9F\x8E\x89\n\nStell dich gerne vor und frag was du m\xC3\xB6chtest \xe2\x80\x94 wir helfen uns gegenseitig! \xF0\x9F\x92\xAA",
        'pt' => "Bem-vindo(a) {name}! \xF0\x9F\x91\x8B\xE2\x9C\xA8\n\n\xC3\x93timo ter voc\xC3\xAA no *{group_name}* \xF0\x9F\x8E\x89\n\nSinta-se \xC3\xA0 vontade para se apresentar e tirar d\xC3\xBAvidas \xe2\x80\x94 estamos aqui para ajudar! \xF0\x9F\x92\xAA",
        'es' => "\xC2\xA1Bienvenido(a) {name}! \xF0\x9F\x91\x8B\xE2\x9C\xA8\n\nQu\xC3\xA9 bueno tenerte en *{group_name}* \xF0\x9F\x8E\x89\n\nPres\xC3\xA9ntate y pregunta lo que necesites \xe2\x80\x94 \xC2\xA1estamos para ayudarnos! \xF0\x9F\x92\xAA",
        'it' => "Benvenuto(a) {name}! \xF0\x9F\x91\x8B\xE2\x9C\xA8\n\nBello averti nel *{group_name}* \xF0\x9F\x8E\x89\n\nPresentati e chiedi pure \xe2\x80\x94 siamo qui per aiutarci! \xF0\x9F\x92\xAA",
        'nl' => "Welkom {name}! \xF0\x9F\x91\x8B\xE2\x9C\xA8\n\nFijn dat je bij *{group_name}* bent \xF0\x9F\x8E\x89\n\nStel je gerust voor en stel je vragen \xe2\x80\x94 we helpen elkaar! \xF0\x9F\x92\xAA",
        'ar' => "\xD9\x85\xD8\xB1\xD8\xAD\xD8\xA8\xD8\xA7 {name}! \xF0\x9F\x91\x8B\xE2\x9C\xA8\n\n\xD8\xB3\xD8\xB9\xD8\xAF\xD8\xA7\xD8\xA1 \xD8\xA8\xD8\xA7\xD9\x86\xD8\xB6\xD9\x85\xD8\xA7\xD9\x85\xD9\x83 \xD8\xA5\xD9\x84\xD9\x89 *{group_name}* \xF0\x9F\x8E\x89\n\n\xD9\x84\xD8\xA7 \xD8\xAA\xD8\xAA\xD8\xB1\xD8\xAF\xD8\xAF \xD9\x81\xD9\x8A \xD8\xA7\xD9\x84\xD8\xAA\xD8\xB9\xD8\xB1\xD9\x8A\xD9\x81 \xD8\xA8\xD9\x86\xD9\x81\xD8\xB3\xD9\x83 \xD9\x88\xD8\xB7\xD8\xB1\xD8\xAD \xD8\xA3\xD8\xB3\xD8\xA6\xD9\x84\xD8\xAA\xD9\x83 \xF0\x9F\x92\xAA",
        'zh' => "\xE6\xAC\xA2\xE8\xBF\x8E {name}\xEF\xBC\x81\xF0\x9F\x91\x8B\xE2\x9C\xA8\n\n\xE5\xBE\x88\xE9\xAB\x98\xE5\x85\xB4\xE4\xBD\xA0\xE5\x8A\xA0\xE5\x85\xA5 *{group_name}* \xF0\x9F\x8E\x89\n\n\xE8\xAF\xB7\xE9\x9A\x8F\xE6\x97\xB6\xE8\x87\xAA\xE6\x88\x91\xE4\xBB\x8B\xE7\xBB\x8D\xE5\x92\x8C\xE6\x8F\x90\xE9\x97\xAE\xEF\xBC\x8C\xE6\x88\x91\xE4\xBB\xAC\xE4\xBA\x92\xE7\x9B\xB8\xE5\xB8\xAE\xE5\x8A\xA9\xEF\xBC\x81\xF0\x9F\x92\xAA",
        'ru' => "\xD0\x94\xD0\xBE\xD0\xB1\xD1\x80\xD0\xBE \xD0\xBF\xD0\xBE\xD0\xB6\xD0\xB0\xD0\xBB\xD0\xBE\xD0\xB2\xD0\xB0\xD1\x82\xD1\x8C, {name}! \xF0\x9F\x91\x8B\xE2\x9C\xA8\n\n\xD0\xA0\xD0\xB0\xD0\xB4\xD1\x8B \xD0\xB2\xD0\xB8\xD0\xB4\xD0\xB5\xD1\x82\xD1\x8C \xD0\xB2\xD0\xB0\xD1\x81 \xD0\xB2 *{group_name}* \xF0\x9F\x8E\x89\n\n\xD0\x9F\xD1\x80\xD0\xB5\xD0\xB4\xD1\x81\xD1\x82\xD0\xB0\xD0\xB2\xD1\x8C\xD1\x82\xD0\xB5\xD1\x81\xD1\x8C \xD0\xB8 \xD0\xB7\xD0\xB0\xD0\xB4\xD0\xB0\xD0\xB2\xD0\xB0\xD0\xB9\xD1\x82\xD0\xB5 \xD0\xB2\xD0\xBE\xD0\xBF\xD1\x80\xD0\xBE\xD1\x81\xD1\x8B \xe2\x80\x94 \xD0\xBC\xD1\x8B \xD0\xBF\xD0\xBE\xD0\xBC\xD0\xBE\xD0\xB3\xD0\xB0\xD0\xB5\xD0\xBC \xD0\xB4\xD1\x80\xD1\x83\xD0\xB3 \xD0\xB4\xD1\x80\xD1\x83\xD0\xB3\xD1\x83! \xF0\x9F\x92\xAA",
    ];

    /**
     * POST /api/welcome/check
     * Called by Baileys when a new member joins a group.
     * Saves member info to DB and returns the welcome message to send.
     */
    public function check(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'group_wa_id' => 'required|string',
            'member_name' => 'required|string|max:200',
            'member_phone' => 'sometimes|string|max:30',
        ]);

        $group = Group::where('whatsapp_group_id', $validated['group_wa_id'])->first();

        if (! $group) {
            return response()->json(['send' => false, 'reason' => 'group_not_found']);
        }

        // Always save the member to database (even if welcome is disabled)
        $phone = $validated['member_phone'] ?? '';
        $memberName = $validated['member_name'];

        if ($phone) {
            $member = GroupMember::updateOrCreate(
                [
                    'group_id' => $group->id,
                    'phone'    => $phone,
                ],
                [
                    'push_name'  => $memberName,
                    'joined_at'  => now(),
                    'left_at'    => null, // clear if re-joining
                ]
            );

            Log::info("GroupMember saved: {$memberName} (+{$phone}) in group #{$group->id} ({$group->name})");
        }

        // Welcome messages are now sent in daily batches by the cron command.
        // We only save the member here — the cron will group all new members
        // and send ONE welcome message per group per day.
        Log::info("Member {$memberName} saved for batch welcome in group #{$group->id} ({$group->name})");

        return response()->json([
            'send'   => false,
            'reason' => 'batch_pending',
            'saved'  => true,
        ]);
    }

    /**
     * POST /api/welcome/left
     * Called by Baileys when a member leaves a group.
     * Marks the member as having left.
     */
    public function left(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'group_wa_id' => 'required|string',
            'member_phone' => 'required|string|max:30',
        ]);

        $group = Group::where('whatsapp_group_id', $validated['group_wa_id'])->first();

        if (! $group) {
            return response()->json(['ok' => false, 'reason' => 'group_not_found']);
        }

        $member = GroupMember::where('group_id', $group->id)
            ->where('phone', $validated['member_phone'])
            ->first();

        if ($member) {
            $member->update(['left_at' => now()]);
            Log::info("GroupMember left: +{$validated['member_phone']} from group #{$group->id} ({$group->name})");
        }

        return response()->json(['ok' => true]);
    }
}
