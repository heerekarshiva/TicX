import { NextRequest, NextResponse } from 'next/server';
import { authed, json, fail, readBody, rateLimit, shapeProducts } from '@/lib/campus/server';
import { wishlistInput } from '@/lib/campus/schemas';

export const dynamic = 'force-dynamic';

export async function GET() {
  const a = await authed(); if (a instanceof NextResponse) return a;
  const { data: w } = await a.admin.from('marketplace_wishlist').select('product_id, created_at').eq('user_id', a.user.id).order('created_at', { ascending: false }).limit(100);
  const ids = (w ?? []).map(x => x.product_id);
  if (!ids.length) return json({ items: [] });
  const { data: rows } = await a.admin.from('marketplace_products').select('*').in('id', ids).in('status', ['active', 'paused', 'sold']);
  const shaped = await shapeProducts(a.admin, rows ?? [], a.user.id);
  const order = new Map(ids.map((id, i) => [id, i]));
  return json({ items: shaped.sort((x: any, y: any) => (order.get(x.id) ?? 0) - (order.get(y.id) ?? 0)) });
}

// Toggle: saves if absent, removes if present.
export async function POST(req: NextRequest) {
  const a = await authed({ write: true }); if (a instanceof NextResponse) return a;
  const limited = await rateLimit(`wish:${a.user.id}`, 60, 60_000); if (limited) return limited;
  const b = await readBody(req, wishlistInput); if ('res' in b) return b.res;
  const { data: ex } = await a.admin.from('marketplace_wishlist').select('id').eq('user_id', a.user.id).eq('product_id', b.data.productId).maybeSingle();
  if (ex) { await a.admin.from('marketplace_wishlist').delete().eq('id', ex.id).eq('user_id', a.user.id); return json({ saved: false }); }
  const { data: p } = await a.admin.from('marketplace_products').select('id').eq('id', b.data.productId).eq('status', 'active').maybeSingle();
  if (!p) return fail('This listing is no longer available.', 404);
  const { count } = await a.admin.from('marketplace_wishlist').select('id', { count: 'exact', head: true }).eq('user_id', a.user.id);
  if ((count ?? 0) >= 200) return fail('Your wishlist is full (200 items).', 409);
  const { error } = await a.admin.from('marketplace_wishlist').insert({ user_id: a.user.id, product_id: b.data.productId });
  if (error && error.code !== '23505') return fail('Could not save to wishlist.', 500);
  return json({ saved: true });
}
