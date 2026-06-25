import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminSupabase } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

/* -------------------------------------------------------------------------- */
/*  GET /api/palm/list                                                        */
/*  Returns all palm readings for the current user (newest first), each with */
/*  a freshly signed image URL. Used by the dashboard carousel and profile   */
/*  page palm-readings list.                                                  */
/* -------------------------------------------------------------------------- */

interface LineLike {
  present?: boolean;
  length?: string;
  depth?: string;
  curvature?: string;
  direction?: string;
  branches?: string;
  startPoint?: string;
  separation?: string;
  interpretation?: string;
  polyline?: Array<[number, number]>;
}

interface AnalysisLines {
  lifeLine?: LineLike;
  heartLine?: LineLike;
  headLine?: LineLike;
  fateLine?: LineLike;
}

export async function GET() {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: rows, error } = await supabase
      .from('palm_readings')
      .select('id, hand, image_url, image_path, analysis, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[palm/list] db error', error);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    if (!rows || rows.length === 0) {
      return NextResponse.json({ readings: [], count: 0 });
    }

    const admin = createAdminSupabase();
    const readings = await Promise.all(rows.map(async (row) => {
      let imageUrl = row.image_url ?? '';
      if (row.image_path) {
        const { data: signed } = await admin.storage
          .from('palm-images')
          .createSignedUrl(row.image_path as string, 60 * 60); // 1h
        if (signed?.signedUrl) imageUrl = signed.signedUrl;
      }
      const analysis = (row.analysis ?? {}) as Record<string, unknown>;
      const major = (analysis.majorLines ?? {}) as AnalysisLines;
      return {
        id: row.id,
        hand: row.hand,
        imageUrl,
        createdAt: row.created_at,
        analysis: row.analysis ?? null,
        lines: {
          heart: major.heartLine,
          head: major.headLine,
          life: major.lifeLine,
          fate: major.fateLine,
        },
      };
    }));

    return NextResponse.json({ readings, count: readings.length });
  } catch (err) {
    console.error('[palm/list]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
