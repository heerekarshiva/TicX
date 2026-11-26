import { NextRequest, NextResponse } from 'next/server';
import { authed, json, fail, readBody, rateLimit, expireStalePromotions } from '@/lib/campus/server';
import { promoInput } from '@/lib/campus/schemas';

export const dynamic = 'force-dynamic';

export async function GET() {
  const a = await authed(); if (a instanceof NextResponse) return a;
  await expireStalePromotions(a.admin);
  const [{ data: plans }, { data: mine }] = await Promise.all([
    a.admin.from('marketplace_promo_plans').select('id, name, duration_days, price').eq('is_active', true).order('duration_days'),
    a.admin.from('marketplace_promotions').select('id, product_id, plan, duration_days, amount, status, payment_status, start_date, end_date, created_at').eq('seller_id', a.user.id).order('created_at', { ascending: false }).limit(50)
  ]);
  const ids = (mine ?? []).map(m => m.product_id);
  const { data: prods } = ids.length ? await a.admin.from('marketplace_products').select('id, title').in('id', ids) : { data: [] as any[] };
  const tm = new Map((prods ?? []).map((p: any) => [p.id, p.title]));
  return json({ plans: (plans ?? []).map(p => ({ ...p, price: Number(p.price) })), mine: (mine ?? []).map(m => ({ ...m, amount: Number(m.amount), product_title: tm.get(m.product_id) ?? '' })) });
}

// Seller REQUESTS a promotion. It stays "pending / unpaid" until an admin confirms payment and activates it.
// (No payment gateway is connected yet; see lib/campus/payments.ts.)
export async function POST(req: NextRequest) {
  const a = await authed({ write: true }); if (a instanceof NextResponse) return a;
  const limited = await rateLimit(`promo:${a.user.id}`, 10, 3_600_000); if (limited) return limited;
  const b = await readBody(req, promoInput); if ('res' in b) return b.res;
  const [{ data: p }, { data: plan }] = await Promise.all([
    a.admin.from('marketplace_products').select('id, status').eq('id', b.data.productId).eq('seller_id', a.user.id).maybeSingle(),
    a.admin.from('marketplace_promo_plans').select('*').eq('id', b.data.planId).eq('is_active', true).maybeSingle()
  ]);
  if (!p) return fail('Listing not found.', 404);
  if (p.status !== 'active') return fail('Only active listings can be promoted.', 409);
  if (!plan) return fail('That promotion plan is not available.', 404);
  const { error } = await a.admin.from('marketplace_promotions').insert({
    product_id: p.id, seller_id: a.user.id, plan_id: plan.id, plan: plan.name, duration_days: plan.duration_days, amount: plan.price, status: 'pending', payment_status: 'unpaid'
  });
  if (error) return error.code === '23505' ? fail('This listing already has a promotion pending or running.', 409) : fail('Could not request the promotion.', 500);
  return json({ ok: true, amount: Number(plan.price) }, 201);
}
