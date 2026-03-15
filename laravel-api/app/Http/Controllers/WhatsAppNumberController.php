<?php

namespace App\Http\Controllers;

use App\Models\WhatsAppNumber;
use GuzzleHttp\Client;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\Rule;

class WhatsAppNumberController extends Controller
{
    private function baileysClient(): Client
    {
        return new Client([
            'base_uri' => config('baileys.service_url'),
            'timeout'  => 15,
            'http_errors' => false,
            'headers'  => ['X-API-Key' => config('baileys.api_key')],
        ]);
    }

    /**
     * GET /api/whatsapp-numbers
     * List all numbers, enriched with real-time status from Baileys.
     */
    public function index(): JsonResponse
    {
        $numbers = WhatsAppNumber::orderByDesc('is_default')->orderBy('name')->get();

        // Try to enrich with real-time data from Baileys
        try {
            $response = $this->baileysClient()->get('/instances');
            $data = json_decode($response->getBody()->getContents(), true);
            $instanceMap = [];

            if (isset($data['instances'])) {
                foreach ($data['instances'] as $inst) {
                    $instanceMap[$inst['slug']] = $inst;
                }
            }

            foreach ($numbers as $number) {
                $inst = $instanceMap[$number->slug] ?? null;
                $number->connected = $inst['connected'] ?? false;
                $number->has_qr = $inst['hasQr'] ?? false;
                $number->daily_sent = $inst['dailySent'] ?? $number->daily_sent;
                $number->effective_daily_max = $inst['effectiveDailyMax'] ?? $number->daily_max;
                $number->warmup = $inst['warmup'] ?? null;
                // Sync ban status from Baileys
                if (($inst['status'] ?? null) === 'banned' && $number->status !== 'banned') {
                    $number->update(['status' => 'banned']);
                }
            }
        } catch (\Exception $e) {
            // If Baileys unreachable, return DB data only
            foreach ($numbers as $number) {
                $number->connected = false;
                $number->has_qr = false;
                $number->effective_daily_max = $number->daily_max;
                $number->warmup = null;
            }
        }

        return response()->json($numbers);
    }

    /**
     * POST /api/whatsapp-numbers
     * Create a new number and register it with Baileys.
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name'      => ['required', 'string', 'max:100'],
            'phone'     => ['required', 'string', 'max:20', 'regex:/^[0-9]+$/', 'unique:whatsapp_numbers,phone'],
            'slug'      => ['nullable', 'string', 'max:50', 'regex:/^[a-z0-9\-]+$/', 'unique:whatsapp_numbers,slug'],
            'daily_max' => ['nullable', 'integer', 'min:1', 'max:500'],
        ]);

        // Auto-generate slug if not provided (uniqid for uniqueness)
        $slug = $validated['slug'] ?? 'sim-' . substr(uniqid(), -6);
        $dailyMax = $validated['daily_max'] ?? 50;

        $number = WhatsAppNumber::create([
            'slug'      => $slug,
            'name'      => $validated['name'],
            'phone'     => $validated['phone'],
            'status'    => 'disconnected',
            'daily_max' => $dailyMax,
        ]);

        // Register with Baileys
        $qr = null;
        try {
            $response = $this->baileysClient()->post('/instances', [
                'json' => [
                    'slug'     => $slug,
                    'phone'    => $validated['phone'],
                    'dailyMax' => $dailyMax,
                ],
                'timeout' => 30,
            ]);
            $data = json_decode($response->getBody()->getContents(), true);
            $qr = $data['qr'] ?? null;
        } catch (\Exception $e) {
            Log::warning('Failed to register instance with Baileys: ' . $e->getMessage());
        }

        return response()->json([
            'number' => $number,
            'qr'     => $qr,
        ], 201);
    }

    /**
     * PUT /api/whatsapp-numbers/{id}
     * Update name, daily_max, is_rotation_enabled.
     */
    public function update(Request $request, int $id): JsonResponse
    {
        $number = WhatsAppNumber::findOrFail($id);

        $validated = $request->validate([
            'name'                 => ['sometimes', 'string', 'max:100'],
            'daily_max'            => ['sometimes', 'integer', 'min:1', 'max:500'],
            'is_rotation_enabled'  => ['sometimes', 'boolean'],
        ]);

        $number->update($validated);

        // Sync config changes to Baileys running instance
        $baileysConfig = [];
        if (isset($validated['daily_max'])) {
            $baileysConfig['dailyMax'] = $validated['daily_max'];
        }
        if (isset($validated['is_rotation_enabled'])) {
            $baileysConfig['rotationEnabled'] = $validated['is_rotation_enabled'];
        }
        if (! empty($baileysConfig)) {
            try {
                $this->baileysClient()->patch("/instances/{$number->slug}/config", [
                    'json' => $baileysConfig,
                ]);
            } catch (\Exception $e) {
                Log::warning("Failed to sync config to Baileys for {$number->slug}: " . $e->getMessage());
            }
        }

        return response()->json($number);
    }

    /**
     * DELETE /api/whatsapp-numbers/{id}
     * Delete number + remove from Baileys.
     */
    public function destroy(int $id): JsonResponse
    {
        $number = WhatsAppNumber::findOrFail($id);

        if ($number->is_default) {
            return response()->json(['error' => 'Cannot delete the default number.'], 422);
        }

        // Remove from Baileys
        try {
            $this->baileysClient()->delete("/instances/{$number->slug}?purge=true");
        } catch (\Exception $e) {
            Log::warning('Failed to remove instance from Baileys: ' . $e->getMessage());
        }

        $number->delete();

        return response()->json(['message' => 'Number deleted.']);
    }

    /**
     * POST /api/whatsapp-numbers/{id}/pause
     */
    public function pause(int $id): JsonResponse
    {
        $number = WhatsAppNumber::findOrFail($id);

        // Call Baileys first, then update DB only if Baileys succeeds
        try {
            $this->baileysClient()->post("/instances/{$number->slug}/pause");
        } catch (\Exception $e) {
            Log::warning('Failed to pause Baileys instance: ' . $e->getMessage());
            // Still update DB — Baileys will re-sync on next boot
        }

        $number->update(['status' => 'paused']);

        return response()->json($number->fresh());
    }

    /**
     * POST /api/whatsapp-numbers/{id}/resume
     */
    public function resume(int $id): JsonResponse
    {
        $number = WhatsAppNumber::findOrFail($id);

        // Call Baileys first, then update DB
        try {
            $this->baileysClient()->post("/instances/{$number->slug}/resume");
        } catch (\Exception $e) {
            Log::warning('Failed to resume Baileys instance: ' . $e->getMessage());
        }

        $number->update(['status' => 'active']);

        return response()->json($number->fresh());
    }

    /**
     * POST /api/whatsapp-numbers/{id}/restart
     */
    public function restart(Request $request, int $id): JsonResponse
    {
        $number = WhatsAppNumber::findOrFail($id);
        $force = $request->boolean('force', false);

        // Clear banned status in DB so the number is picked up on next boot
        if ($number->status === 'banned') {
            $number->update(['status' => 'disconnected']);
        }

        $qr = null;
        try {
            $response = $this->baileysClient()->post("/instances/{$number->slug}/restart", [
                'json'    => ['force' => $force],
                'timeout' => 30,
            ]);
            $data = json_decode($response->getBody()->getContents(), true);
            $qr = $data['qr'] ?? null;
        } catch (\Exception $e) {
            Log::warning('Failed to restart Baileys instance: ' . $e->getMessage());
        }

        return response()->json([
            'number' => $number->fresh(),
            'qr'     => $qr,
        ]);
    }

    /**
     * GET /api/whatsapp-numbers/{id}/qr
     */
    public function qr(int $id): JsonResponse
    {
        $number = WhatsAppNumber::findOrFail($id);

        try {
            $response = $this->baileysClient()->get("/instances/{$number->slug}/qr");
            $data = json_decode($response->getBody()->getContents(), true);
            return response()->json($data);
        } catch (\Exception $e) {
            return response()->json(['connected' => false, 'qr' => null, 'error' => $e->getMessage()]);
        }
    }

    /**
     * POST /api/whatsapp-numbers/{id}/set-default
     */
    public function setDefault(int $id): JsonResponse
    {
        $number = WhatsAppNumber::findOrFail($id);

        // Reset all is_default, then set this one
        WhatsAppNumber::query()->update(['is_default' => false]);
        $number->update(['is_default' => true]);

        return response()->json($number->fresh());
    }

    /**
     * GET /api/whatsapp-numbers/active
     * Public route (protected by Baileys API key) for Baileys boot.
     * Returns active numbers for instance initialization.
     */
    public function active(): JsonResponse
    {
        // Include all non-paused numbers (even banned — Baileys manages their status)
        $numbers = WhatsAppNumber::where('status', '!=', 'paused')
            ->get(['slug', 'phone', 'daily_max', 'is_rotation_enabled', 'created_at', 'status']);

        return response()->json(['numbers' => $numbers]);
    }

    /**
     * PATCH /api/whatsapp-numbers/report-ban
     * Called by Baileys when a number gets banned.
     */
    public function reportBan(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'slug' => ['required', 'string', 'exists:whatsapp_numbers,slug'],
        ]);

        $number = WhatsAppNumber::where('slug', $validated['slug'])->firstOrFail();
        $number->update([
            'status'    => 'banned',
            'ban_count' => $number->ban_count + 1,
            'last_error' => 'Banned by WhatsApp',
        ]);

        return response()->json(['message' => 'Ban recorded.']);
    }
}
