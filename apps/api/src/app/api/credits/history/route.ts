import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import type { PaginatedResponse } from '@aroha-astrology/shared';

// ============================================================
// GET /api/credits/history
// ============================================================

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json<PaginatedResponse>(
        { success: false, error: 'Unauthorized', page: 0, pageSize: 0, total: 0, hasMore: false },
        { status: 401 },
      );
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '20', 10)));
    const offset = (page - 1) * pageSize;

    // Fetch credit transactions with count
    const { data: transactions, count, error: fetchError } = await supabase
      .from('credit_transactions')
      .select('*', { count: 'exact' })
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (fetchError) {
      return NextResponse.json<PaginatedResponse>(
        {
          success: false,
          error: `Failed to fetch credit history: ${fetchError.message}`,
          page,
          pageSize,
          total: 0,
          hasMore: false,
        },
        { status: 500 },
      );
    }

    const total = count ?? 0;

    return NextResponse.json<PaginatedResponse>({
      success: true,
      data: transactions ?? [],
      page,
      pageSize,
      total,
      hasMore: total > offset + pageSize,
    });
  } catch (error) {
    console.error('Credit history error:', error);
    return NextResponse.json<PaginatedResponse>(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch credit history',
        page: 0,
        pageSize: 0,
        total: 0,
        hasMore: false,
      },
      { status: 500 },
    );
  }
}
