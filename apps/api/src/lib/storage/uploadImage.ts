import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Client-side image upload helper. Uploads to a public Storage bucket and
 * returns the public URL. Callers are responsible for validating user auth
 * upstream — RLS / bucket policies enforce the rest.
 *
 *   const url = await uploadImage(supabase, 'pandit-profiles', `${userId}.jpg`, file);
 */
export async function uploadImage(
  supabase: SupabaseClient,
  bucket: string,
  path: string,
  file: File | Blob,
): Promise<string> {
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, file, { upsert: true, contentType: file.type || 'image/jpeg' });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}
