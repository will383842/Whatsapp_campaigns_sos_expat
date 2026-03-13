<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\GroupController;
use App\Http\Controllers\MessageController;
use App\Http\Controllers\SendController;
use App\Http\Controllers\SeriesController;
use App\Http\Controllers\StatsController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Authentication Routes (no middleware — public)
|--------------------------------------------------------------------------
*/

Route::post('/auth/login', [AuthController::class, 'login'])->middleware('throttle:auth');

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/auth/logout', [AuthController::class, 'logout']);
    Route::get('/auth/me', [AuthController::class, 'me']);
});

/*
|--------------------------------------------------------------------------
| Baileys Callback Routes (protected by API key, not Sanctum session)
|--------------------------------------------------------------------------
*/

Route::middleware('baileys.api.key')->prefix('send')->group(function () {
    Route::post('/report', [SendController::class, 'report']);
    Route::post('/report/complete', [SendController::class, 'reportComplete']);
});

/*
|--------------------------------------------------------------------------
| Dashboard Routes (protected by Sanctum session auth)
|--------------------------------------------------------------------------
*/

Route::middleware(['auth:sanctum', 'throttle:api'])->group(function () {

    // --- Stats ---
    Route::get('/stats', [StatsController::class, 'index']);

    // --- Groups ---
    Route::get('/groups', [GroupController::class, 'index']);
    Route::get('/groups/by-language/{lang}', [GroupController::class, 'byLanguage']);

    // --- Campaign Series (read) ---
    Route::get('/series', [SeriesController::class, 'index']);
    Route::get('/series/{id}', [SeriesController::class, 'show']);
    Route::get('/series/{id}/logs', [SeriesController::class, 'logs']);

    // --- Campaign Series (write — admin only) ---
    Route::middleware('role:admin')->group(function () {
        Route::post('/series', [SeriesController::class, 'store']);
        Route::put('/series/{id}', [SeriesController::class, 'update']);
        Route::delete('/series/{id}', [SeriesController::class, 'destroy']);

        // Series lifecycle actions
        Route::post('/series/{id}/schedule', [SeriesController::class, 'schedule']);
        Route::post('/series/{id}/pause', [SeriesController::class, 'pause']);
        Route::post('/series/{id}/resume', [SeriesController::class, 'resume']);
        Route::post('/series/{id}/cancel', [SeriesController::class, 'cancel']);
        Route::post('/series/{id}/test-send', [SeriesController::class, 'testSend']);
    });

    // --- Messages (read) ---
    Route::get('/series/{seriesId}/messages', [MessageController::class, 'index']);
    Route::get('/series/{seriesId}/messages/{messageId}/logs', [MessageController::class, 'logs']);

    // --- Messages (write — admin only) ---
    Route::middleware('role:admin')->group(function () {
        Route::post('/series/{seriesId}/messages', [MessageController::class, 'store']);
        Route::put('/series/{seriesId}/messages/{messageId}', [MessageController::class, 'update']);
        Route::delete('/series/{seriesId}/messages/{messageId}', [MessageController::class, 'destroy']);
        Route::post('/series/{seriesId}/messages/translate', [MessageController::class, 'translate']);
    });
});
