<?php

namespace App\Http\Controllers;

use App\Models\Group;
use App\Models\GroupMember;
use GuzzleHttp\Client;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class GroupController extends Controller
{
    /**
     * Return all groups.
     */
    public function index(): JsonResponse
    {
        $groups = Group::orderBy('community_name')
            ->orderBy('name')
            ->get();

        return response()->json($groups);
    }

    /**
     * Return all groups matching a given language code.
     */
    public function byLanguage(string $lang): JsonResponse
    {
        $groups = Group::where('language', $lang)
            ->where('is_active', true)
            ->orderBy('name')
            ->get();

        return response()->json($groups);
    }

    /**
     * Sync WhatsApp groups from Baileys into the database.
     * Calls the Baileys /groups endpoint and upserts all groups.
     */
    public function sync(): JsonResponse
    {
        $baileysUrl = config('baileys.service_url');
        $baileysKey = config('baileys.api_key');

        $client = new Client(['timeout' => 30]);

        try {
            $response = $client->get("{$baileysUrl}/groups", [
                'headers' => ['X-API-Key' => $baileysKey],
            ]);

            $data = json_decode($response->getBody()->getContents(), true);

            if (! ($data['success'] ?? false) || ! isset($data['groups'])) {
                return response()->json(['error' => 'Unexpected response from Baileys'], 502);
            }
        } catch (\Exception $e) {
            Log::error('Group sync: Baileys request failed — ' . $e->getMessage());
            return response()->json(['error' => 'Cannot reach Baileys service: ' . $e->getMessage()], 502);
        }

        $created = 0;
        $updated = 0;
        $skipped = 0;

        // Build community name lookup: community_id => community_name
        $communityNames = [];
        foreach ($data['groups'] as $waGroup) {
            if ($waGroup['is_community'] ?? false) {
                $communityNames[$waGroup['id'] . '@g.us'] = $waGroup['name'];
            }
        }

        foreach ($data['groups'] as $waGroup) {
            // Skip community announcement groups (they are not real groups you message)
            if ($waGroup['is_community_announce'] ?? false) {
                $skipped++;
                continue;
            }

            // Skip community containers themselves
            if ($waGroup['is_community'] ?? false) {
                $skipped++;
                continue;
            }

            // Resolve community name from linked_parent
            $communityName = null;
            if (! empty($waGroup['linked_parent'])) {
                $communityName = $communityNames[$waGroup['linked_parent']] ?? null;
            }

            $existing = Group::where('whatsapp_group_id', $waGroup['id'])->first();

            if ($existing) {
                $existing->update([
                    'name' => $waGroup['name'],
                    'member_count' => $waGroup['member_count'],
                    'community_name' => $communityName,
                ]);
                $updated++;
            } else {
                Group::create([
                    'whatsapp_group_id' => $waGroup['id'],
                    'name' => $waGroup['name'],
                    'community_name' => $communityName,
                    'member_count' => $waGroup['member_count'],
                    'language' => 'fr',
                    'is_active' => true,
                ]);
                $created++;
            }
        }

        Log::info("Group sync complete: {$created} created, {$updated} updated, {$skipped} skipped (communities).");

        return response()->json([
            'success' => true,
            'created' => $created,
            'updated' => $updated,
            'skipped' => $skipped,
            'total_in_db' => Group::count(),
        ]);
    }

    /**
     * GET /api/groups/{id}/participants
     * Fetch live participant list from WhatsApp via Baileys.
     */
    public function participants(int $id): JsonResponse
    {
        $group = Group::findOrFail($id);

        $baileysUrl = config('baileys.service_url');
        $baileysKey = config('baileys.api_key');
        $client = new Client(['timeout' => 15]);

        try {
            $response = $client->get("{$baileysUrl}/groups/{$group->whatsapp_group_id}/participants", [
                'headers' => ['X-API-Key' => $baileysKey],
            ]);

            $data = json_decode($response->getBody()->getContents(), true);

            return response()->json($data);
        } catch (\Exception $e) {
            Log::error("Failed to fetch participants for group #{$id}: " . $e->getMessage());

            return response()->json([
                'error' => 'Cannot fetch participants: ' . $e->getMessage(),
            ], 502);
        }
    }

    /**
     * GET /api/groups/{id}/members
     * Return stored members from the database (joined via welcome system).
     */
    public function members(int $id): JsonResponse
    {
        $group = Group::findOrFail($id);

        $members = GroupMember::where('group_id', $group->id)
            ->whereNull('left_at')
            ->orderByDesc('joined_at')
            ->get()
            ->map(function ($m) {
                return [
                    'id'           => $m->id,
                    'phone'        => $m->phone,
                    'push_name'    => $m->push_name,
                    'display_name' => $m->display_name,
                    'is_admin'     => $m->is_admin,
                    'welcome_sent' => $m->welcome_sent,
                    'joined_at'    => $m->joined_at?->toIso8601String(),
                ];
            });

        return response()->json([
            'count'   => $members->count(),
            'members' => $members,
        ]);
    }

    /**
     * GET /api/groups/wa-ids
     * Protected by Baileys API key. Returns all whatsapp_group_ids from the DB.
     * Used by Baileys lock-all to only process registered groups.
     */
    public function waIds(): JsonResponse
    {
        $ids = Group::where('is_active', true)
            ->pluck('whatsapp_group_id')
            ->toArray();

        return response()->json(['ids' => $ids, 'count' => count($ids)]);
    }

    /**
     * POST /api/groups/update-invite-links
     * Protected by Baileys API key. Batch update invite links for groups.
     * Body: { links: [ { whatsapp_group_id: "xxx", invite_link: "https://..." }, ... ] }
     */
    public function updateInviteLinks(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'links' => 'required|array',
            'links.*.whatsapp_group_id' => 'required|string',
            'links.*.invite_link' => 'required|string',
        ]);

        $updated = 0;

        foreach ($validated['links'] as $item) {
            $count = Group::where('whatsapp_group_id', $item['whatsapp_group_id'])
                ->update(['invite_link' => $item['invite_link']]);
            $updated += $count;
        }

        Log::info("Invite links updated for {$updated} groups.");

        return response()->json(['success' => true, 'updated' => $updated]);
    }

    /**
     * GET /api/groups/firestore-links
     * Protected by Baileys API key. Returns all mapped groups with their
     * Firestore group IDs and current invite links.
     * Used by Firebase Cloud Function to sync links to Firestore.
     */
    public function firestoreLinks(): JsonResponse
    {
        $groups = Group::whereNotNull('firestore_group_id')
            ->whereNotNull('invite_link')
            ->where('is_active', true)
            ->get(['firestore_group_id', 'invite_link', 'name']);

        $links = $groups->map(fn ($g) => [
            'firestore_group_id' => $g->firestore_group_id,
            'invite_link' => $g->invite_link,
            'name' => $g->name,
        ])->values();

        return response()->json([
            'success' => true,
            'count' => $links->count(),
            'links' => $links,
        ]);
    }

    /**
     * Update a group (language, is_active, country, continent).
     */
    public function update(Request $request, int $id): JsonResponse
    {
        $group = Group::findOrFail($id);

        $validated = $request->validate([
            'language' => 'sometimes|string|max:5',
            'is_active' => 'sometimes|boolean',
            'country' => 'sometimes|nullable|string|max:100',
            'continent' => 'sometimes|nullable|string|max:100',
            'welcome_enabled' => 'sometimes|boolean',
            'welcome_message' => 'sometimes|nullable|string|max:2000',
            'whatsapp_number_id' => 'sometimes|nullable|integer|exists:whatsapp_numbers,id',
        ]);

        $group->update($validated);

        return response()->json($group);
    }

    /**
     * Bulk-assign a WhatsApp number to multiple groups.
     * POST /api/groups/assign-number
     * Body: { whatsapp_number_id: 1|null, group_ids: [1, 2, 3] }
     */
    public function assignNumber(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'whatsapp_number_id' => 'nullable|integer|exists:whatsapp_numbers,id',
            'group_ids'          => 'required|array|min:1',
            'group_ids.*'        => 'integer|exists:groups,id',
        ]);

        $updated = Group::whereIn('id', $validated['group_ids'])
            ->update(['whatsapp_number_id' => $validated['whatsapp_number_id']]);

        return response()->json([
            'message' => "{$updated} groupe(s) mis à jour.",
            'updated' => $updated,
        ]);
    }
}
