import { NextRequest, NextResponse } from 'next/server';
import { authed, json, fail, readBody, rateLimit } from '@/lib/campus/server';
import { offerInput } from '@/lib/campus/schemas';
import { looksLikeSpam } from '@/lib/campus/spam';
import { imageUrl, shortName } from '@/lib/campus/format';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const a = await authed(); if (a instanceof NextResponse) return a;
  const box = req.nextUrl.searchParams.get('box') === 'sent' ? 'sent' : 'received';
  const { data: offers } = await a.admin.from('marketplace_offers').select('*').eq(box === 'sent' ? 'buyer_id' : 'seller_id', a.user.id).order('created_at', { ascending: false }).limit(100);
  if (!offers?.length) return json({ items: [] });
  const otherIds = Array.from(new Set(offers.map(o => (box === 'sent' ? o.seller_id : o.buyer_id))));
  const [{ data: prods }, { data: profs }] = await Promise.all([
    a.admin.from('marketplace_products').select('id, title, images, selling_price, status').in('id', offers.map(o => o.product_id)),
    a.admin.from('profiles').select('id, full_name').in('id', otherIds)
  ]);
  const pm = new Map((prods ?? []).map(p => [p.id, p])); const nm = new Map((profs ?? []).map(p => [p.id, p.full_name]));
  return json({ items: offers.map(o => { const p: any = pm.get(o.product_id); return {
    id: o.id, status: o.status, offered_price: Number(o.offered_price), created_at: o.created_at, conversation_id: o.conversation_id,
    other_name: shortName(nm.get(box === 'sent' ? o.seller_id : o.buyer_id)),
    product: p ? { id: p.id, title: p.title, image: p.images?.[0] ? imageUrl(p.images[0]) : null, price: Number(p.selling_price), status: p.status } : null }; }) });
}

export async function POST(req: NextRequest) {
  const a = await authed({ write: true }); if (a instanceof NextResponse) return a;
  const limited = await rateLimit(`offer:${a.user.id}`, 10, 3_600_000, 'You have made many offers recently. Please wait a bit.'); if (limited) return limited;
  const b = await readBody(req, offerInput); if ('res' in b) return b.res;
  const { productId, price, message } = b.data;
  if (message && looksLikeSpam(message)) return fail('That message looks like spam. Please rewrite it.');

  const { data: p } = await a.admin.from('marketplace_products').select('id, seller_id, status, selling_price, price_type, contact_method').eq('id', productId).maybeSingle();
  if (!p || p.status !== 'active') return fail('This listing is no longer available.', 404);
  if (p.seller_id === a.user.id) return fail('You cannot make an offer on your own listing.');
  if (p.contact_method === 'chat_only') return fail('This seller is not taking offers. Send a message instead.', 403);
  if (p.price_type === 'fixed') return fail('The seller set a fixed price for this item. Message them if you have questions.', 403);
  const ask = Number(p.selling_price);
  if (price > ask) return fail('Your offer is higher than the asking price.');
  if (price < ask * 0.3) return fail('That offer is far below the asking price. Please make a realistic offer.');

  let { data: conv } = await a.admin.from('marketplace_conversations').select('id').eq('product_id', p.id).eq('buyer_id', a.user.id).maybeSingle();
  if (!conv) {
    const ins = await a.admin.from('marketplace_conversations').insert({ product_id: p.id, buyer_id: a.user.id, seller_id: p.seller_id }).select('id').single();
    if (ins.error) { const again = await a.admin.from('marketplace_conversations').select('id').eq('product_id', p.id).eq('buyer_id', a.user.id).maybeSingle(); conv = again.data; } else conv = ins.data;
  }
  // The DB's partial unique index allows one open (pending/accepted) offer per buyer per product.
  const { data: offer, error } = await a.admin.from('marketplace_offers').insert({
    product_id: p.id, buyer_id: a.user.id, seller_id: p.seller_id, conversation_id: conv?.id ?? null, offered_price: price
  }).select('id').single();
  if (error) return error.code === '23505' ? fail('You already have an open offer on this listing.', 409) : fail('Could not send your offer.', 500);
  if (conv) {
    await a.admin.from('marketplace_messages').insert({ conversation_id: conv.id, sender_id: a.user.id, receiver_id: p.seller_id, message: `Offer: ₹${price.toLocaleString('en-IN')}${message ? ` — ${message}` : ''}` });
    await a.admin.from('marketplace_conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conv.id);
  }
  return json({ id: offer.id, conversationId: conv?.id ?? null }, 201);
}
