import { createAdminClient } from '@/lib/supabase/admin';
import { json, fail, PUBLIC_CACHE } from '@/lib/campus/server';

export const dynamic = 'force-dynamic';
export async function GET() {
  const { data, error } = await createAdminClient().from('marketplace_categories').select('id, name, slug, description').eq('is_active', true).order('sort_order').order('name');
  if (error) return fail('Could not load categories.', 500);
  return json({ categories: data }, 200, PUBLIC_CACHE);
}
