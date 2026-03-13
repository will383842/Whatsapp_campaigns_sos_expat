<?php

namespace App\Http\Controllers;

use App\Models\Group;
use Illuminate\Http\JsonResponse;

class GroupController extends Controller
{
    /**
     * Return all groups.
     */
    public function index(): JsonResponse
    {
        $groups = Group::orderBy('continent')
            ->orderBy('country')
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
}
