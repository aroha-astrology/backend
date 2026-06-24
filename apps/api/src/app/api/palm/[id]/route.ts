import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminSupabase } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

/* -------------------------------------------------------------------------- */
/*  GET /api/palm/[id]                                                        */
/* -------------------------------------------------------------------------- */

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: row, error } = await supabase
      .from('palm_readings')
      .select('id, hand, analysis, image_path, image_url, nova_canvas_image_url, created_at')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) return NextResponse.json({ error: 'Database error' }, { status: 500 });
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    let imageUrl = row.image_url as string | null;
    if (!imageUrl && row.image_path) {
      try {
        const admin = createAdminSupabase();
        const signed = await admin.storage
          .from('palm-images')
          .createSignedUrl(row.image_path as string, 60 * 60 * 24 * 365);
        imageUrl = signed.data?.signedUrl ?? null;
      } catch { /* non-fatal */ }
    }

    return NextResponse.json({
      success: true,
      data: {
        id: row.id,
        hand: row.hand,
        analysis: row.analysis,
        imageUrl,
        novaCanvasImageUrl: row.nova_canvas_image_url ?? null,
        createdAt: row.created_at,
      },
    });
  } catch (err) {
    console.error('[palm GET]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

/* -------------------------------------------------------------------------- */
/*  DELETE /api/palm/[id]                                                     */
/*  Removes a palm reading row + its storage object. RLS scopes the row     */
/*  delete to the owning user; storage cleanup uses the service role since  */
/*  the bucket is private.                                                   */
/* -------------------------------------------------------------------------- */

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: row, error: fetchErr } = await supabase
      .from('palm_readings')
      .select('id, image_path')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (fetchErr) {
      console.error('[palm DELETE] fetch error', fetchErr);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    if (row.image_path) {
      try {
        const admin = createAdminSupabase();
        await admin.storage.from('palm-images').remove([row.image_path as string]);
      } catch (e) {
        console.warn('[palm DELETE] storage cleanup failed', e);
      }
    }

    const { error: delErr } = await supabase
      .from('palm_readings')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (delErr) {
      console.error('[palm DELETE] db error', delErr);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[palm DELETE]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
