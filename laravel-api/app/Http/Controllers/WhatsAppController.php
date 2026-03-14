<?php

namespace App\Http\Controllers;

use GuzzleHttp\Client;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Log;

class WhatsAppController extends Controller
{
    private function baileysClient(): Client
    {
        return new Client([
            'base_uri'        => config('baileys.service_url'),
            'timeout'         => 15,
            'http_errors'     => false,
            'headers'         => ['X-API-Key' => config('baileys.api_key')],
        ]);
    }

    /**
     * GET /api/whatsapp/status
     * Returns WhatsApp connection health from Baileys service.
     */
    public function status(): JsonResponse
    {
        try {
            $response = $this->baileysClient()->get('/health');
            $data = json_decode($response->getBody()->getContents(), true);

            return response()->json($data);
        } catch (\Exception $e) {
            Log::warning('WhatsApp status check failed: ' . $e->getMessage());

            return response()->json([
                'status'    => 'unreachable',
                'connected' => false,
                'phone'     => null,
                'error'     => 'Cannot reach Baileys service',
            ]);
        }
    }

    /**
     * POST /api/whatsapp/restart
     * Triggers a WhatsApp reconnection via Baileys service.
     */
    public function restart(): JsonResponse
    {
        try {
            $response = $this->baileysClient()->post('/restart', [
                'timeout' => 30,
            ]);
            $data = json_decode($response->getBody()->getContents(), true);

            return response()->json($data);
        } catch (\Exception $e) {
            Log::error('WhatsApp restart failed: ' . $e->getMessage());

            return response()->json([
                'success' => false,
                'error'   => 'Cannot reach Baileys service: ' . $e->getMessage(),
            ], 502);
        }
    }

    /**
     * GET /api/whatsapp/qr
     * Returns QR code data URL for pairing (if disconnected).
     */
    public function qr(): JsonResponse
    {
        try {
            $response = $this->baileysClient()->get('/qr/data');
            $data = json_decode($response->getBody()->getContents(), true);

            return response()->json($data);
        } catch (\Exception $e) {
            Log::warning('WhatsApp QR fetch failed: ' . $e->getMessage());

            return response()->json([
                'connected' => false,
                'qr'        => null,
                'error'     => 'Cannot reach Baileys service',
            ]);
        }
    }
}
