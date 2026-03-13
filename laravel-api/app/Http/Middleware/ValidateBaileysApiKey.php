<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class ValidateBaileysApiKey
{
    public function handle(Request $request, Closure $next): Response
    {
        $apiKey = config('baileys.api_key');

        if (empty($apiKey) || $request->header('X-API-Key') !== $apiKey) {
            return response()->json([
                'message' => 'Unauthorized. Invalid or missing API key.',
            ], 401);
        }

        return $next($request);
    }
}
