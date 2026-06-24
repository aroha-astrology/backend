import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminSupabase } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

/* -------------------------------------------------------------------------- */
/*  GET /api/palm/latest                                                      */
/*  Returns the user's most recent palm reading + signed URL for the photo.  */
/*  Used by the dashboard palm-infographic card. Returns null when none.     */
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

    const [{ data: row, error }, { count, error: countError }] = await Promise.all([
      supabase
        .from('palm_readings')
        .select('id, hand, image_url, image_path, analysis, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('palm_readings')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id),
    ]);

    if (error || countError) {
      console.error('[palm/latest] db error', error ?? countError);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    const usage = { used: count ?? 0, max: 3 };

    if (!row) return NextResponse.json({ reading: null, usage });

    let imageUrl = row.image_url ?? '';
    if (row.image_path) {
      const admin = createAdminSupabase();
      const { data: signed } = await admin.storage
        .from('palm-images')
        .createSignedUrl(row.image_path as string, 60 * 60); // 1h
      if (signed?.signedUrl) imageUrl = signed.signedUrl;
    }

    const analysis = (row.analysis ?? {}) as Record<string, unknown>;
    const major = (analysis.majorLines ?? {}) as AnalysisLines;

    return NextResponse.json({
      reading: {
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
      },
      usage,
    });
  } catch (err) {
    console.error('[palm/latest]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
