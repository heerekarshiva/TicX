import { NextRequest } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimitShared } from '@/lib/rate-limit';
import { json, ipKey, optionalUserId } from '@/lib/campus/server';

export const dynamic = 'force-dynamic';
// Counts one view per viewer per listing per hour (so refreshing can't inflate the number). Owners don't count.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!z.string().uuid().safeParse(params.id).success) return json({ ok: true });
  const uid = await optionalUserId();
  const admin = createAdminClient();
  const { data: p } = await admin.from('marketplace_products').select('seller_id').eq('id', params.id).maybeSingle();
  if (!p || p.seller_id === uid) return json({ ok: true });
  if (await checkRateLimitShared(`campus:view:${params.id}:${uid ?? ipKey(req)}`, 1, 3_600_000)) await admin.rpc('marketplace_bump_views', { p_product: params.id });
  return json({ ok: true });
}
