import { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { json, fail, PUBLIC_CACHE, rateLimit, ipKey } from '@/lib/campus/server';
import { collegeQuery } from '@/lib/campus/schemas';

export const dynamic = 'force-dynamic';
// Searchable college picker. Public read; capped at 15 rows; trigram-indexed.
export async function GET(req: NextRequest) {
  const limited = await rateLimit(`colleges:${ipKey(req)}`, 120, 60_000); if (limited) return limited;
  const p = collegeQuery.safeParse({ q: req.nextUrl.searchParams.get('q') ?? '' });
  if (!p.success) return fail('Invalid search.');
  const term = p.data.q.replace(/[^\p{L}\p{N} -]/gu, ' ').trim();
  let qb = createAdminClient().from('marketplace_colleges').select('name, city, state').order('name').limit(15);
  if (term) qb = qb.ilike('name', `%${term}%`);
  const { data, error } = await qb;
  if (error) return fail('Could not search colleges.', 500);
  return json({ colleges: data }, 200, PUBLIC_CACHE);
}
