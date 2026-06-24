import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import type { ApiResponse } from '@aroha-astrology/shared';

const ALLOWED_FIELDS = ['name', 'phone', 'theme', 'language', 'chart_style'];
const VALID_THEMES = ['dark', 'light', 'premium'];
const VALID_LANGUAGES = [
  'en','hi','bn','ta','te','mr','gu','kn','ml',
  'pa','or','ur','ne','sa','es','fr','de','ar','zh','ja',
];
const VALID_CHART_STYLES = ['north', 'south'];

// ============================================================
// PATCH /api/user/settings
// ============================================================

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      );
    }

    const updates = await request.json();

    // Only allow safe fields
    const safeUpdates: Record<string, unknown> = {};
    for (const key of ALLOWED_FIELDS) {
      if (key in updates) {
        safeUpdates[key] = updates[key];
      }
    }

    if (Object.keys(safeUpdates).length === 0) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: `No valid fields to update. Allowed: ${ALLOWED_FIELDS.join(', ')}` },
        { status: 400 },
      );
    }

    // Validate field values
    if (safeUpdates.theme && !VALID_THEMES.includes(safeUpdates.theme as string)) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: `Invalid theme. Must be one of: ${VALID_THEMES.join(', ')}` },
        { status: 400 },
      );
    }

    if (safeUpdates.language && !VALID_LANGUAGES.includes(safeUpdates.language as string)) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: `Invalid language. Must be one of: ${VALID_LANGUAGES.join(', ')}` },
        { status: 400 },
      );
    }

    if (safeUpdates.chart_style && !VALID_CHART_STYLES.includes(safeUpdates.chart_style as string)) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: `Invalid chart_style. Must be one of: ${VALID_CHART_STYLES.join(', ')}` },
        { status: 400 },
      );
    }

    // Validate name length
    if (safeUpdates.name && typeof safeUpdates.name === 'string') {
      if (safeUpdates.name.length < 2 || safeUpdates.name.length > 100) {
        return NextResponse.json<ApiResponse>(
          { success: false, error: 'Name must be between 2 and 100 characters' },
          { status: 400 },
        );
      }
    }

    const { data, error } = await supabase
      .from('users')
      .update(safeUpdates)
      .eq('id', user.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: `Failed to update settings: ${error.message}` },
        { status: 500 },
      );
    }

    return NextResponse.json<ApiResponse>({
      success: true,
      data,
      message: 'Settings updated successfully',
    });
  } catch (error) {
    console.error('Settings update error:', error);
    return NextResponse.json<ApiResponse>(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update settings',
      },
      { status: 500 },
    );
  }
}

// ============================================================
// GET /api/user/settings
// ============================================================

export async function GET(_request: NextRequest) {
  try {
    const supabase = await createServerSupabase();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      );
    }

    const { data, error } = await supabase
      .from('users')
      .select('id, email, name, phone, credits, theme, language, chart_style, is_premium, premium_until, created_at, legal_accepted_at, legal_version')
      .eq('id', user.id)
      .single();

    if (error) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: `Failed to fetch settings: ${error.message}` },
        { status: 500 },
      );
    }

    return NextResponse.json<ApiResponse>({
      success: true,
      data,
    });
  } catch (error) {
    console.error('Settings fetch error:', error);
    return NextResponse.json<ApiResponse>(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch settings',
      },
      { status: 500 },
    );
  }
}
