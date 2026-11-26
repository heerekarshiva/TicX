import { NextResponse } from 'next/server';
import { authed, json, shapeProducts, expireStalePromotions } from '@/lib/campus/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const a = await authed(); if (a instanceof NextResponse) return a;
  await expireStalePromotions(a.admin);
  const { data: rows } = await a.admin.from('marketplace_products').select('*').eq('seller_id', a.user.id).order('created_at', { ascending: false }).limit(200);
  const items = await shapeProducts(a.admin, rows ?? [], a.user.id);
  const meta = new Map((rows ?? []).map(r => [r.id, { views: r.views_count, note: r.moderation_note, featured_until: r.featured_until }]));
  const by = (s: string) => (rows ?? []).filter(r => r.status === s).length;
  const [{ count: pendingOffers }, { count: wish }] = await Promise.all([
    a.admin.from('marketplace_offers').select('id', { count: 'exact', head: true }).eq('seller_id', a.user.id).eq('status', 'pending'),
    a.admin.from('marketplace_wishlist').select('id', { count: 'exact', head: true }).eq('user_id', a.user.id)
  ]);
  return json({
    listings: items.map((i: any) => ({ ...i, views: meta.get(i.id)?.views ?? 0, moderation_note: meta.get(i.id)?.note ?? null, featured_until: meta.get(i.id)?.featured_until ?? null })),
    stats: { total: rows?.length ?? 0, active: by('active'), paused: by('paused'), sold: by('sold'), pending: by('pending'), removed: by('removed') + by('rejected'),
      views: (rows ?? []).reduce((s, r) => s + (r.views_count ?? 0), 0), pendingOffers: pendingOffers ?? 0, wishlist: wish ?? 0 }
  });
}
