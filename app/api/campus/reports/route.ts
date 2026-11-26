import { NextRequest, NextResponse } from 'next/server';
import { authed, json, fail, readBody, rateLimit } from '@/lib/campus/server';
import { reportInput } from '@/lib/campus/schemas';

export const dynamic = 'force-dynamic';

export async function GET() {
  const a = await authed(); if (a instanceof NextResponse) return a;
  const { data } = await a.admin.from('marketplace_reports').select('id, product_id, reason, status, created_at').eq('reporter_id', a.user.id).order('created_at', { ascending: false }).limit(50);
  const ids = (data ?? []).map(r => r.product_id);
  const { data: prods } = ids.length ? await a.admin.from('marketplace_products').select('id, title').in('id', ids) : { data: [] as any[] };
  const tm = new Map((prods ?? []).map((p: any) => [p.id, p.title]));
  return json({ items: (data ?? []).map(r => ({ ...r, product_title: tm.get(r.product_id) ?? 'Removed listing' })) });
}

export async function POST(req: NextRequest) {
  const a = await authed({ write: true }); if (a instanceof NextResponse) return a;
  const limited = await rateLimit(`report:${a.user.id}`, 10, 3_600_000); if (limited) return limited;
  const b = await readBody(req, reportInput); if ('res' in b) return b.res;
  const { data: p } = await a.admin.from('marketplace_products').select('id, seller_id').eq('id', b.data.productId).maybeSingle();
  if (!p) return fail('Listing not found.', 404);
  if (p.seller_id === a.user.id) return fail('You cannot report your own listing.');
  const { error } = await a.admin.from('marketplace_reports').insert({ product_id: p.id, reporter_id: a.user.id, reason: b.data.reason, details: b.data.details || null });
  if (error) return error.code === '23505' ? fail('You have already reported this listing. Our team will review it.', 409) : fail('Could not submit your report.', 500);
  return json({ ok: true }, 201);
}
