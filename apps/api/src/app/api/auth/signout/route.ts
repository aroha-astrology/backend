import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

export async function POST() {
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();

  const response = NextResponse.json({ success: true });
  // Clear auth cookies explicitly
  response.cookies.delete('sb-access-token');
  response.cookies.delete('sb-refresh-token');

  return response;
}
