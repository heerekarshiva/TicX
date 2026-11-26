import { NextRequest, NextResponse } from 'next/server';
import { authed, json, fail, readBody, rateLimit } from '@/lib/campus/server';
import { inquiryInput } from '@/lib/campus/schemas';
import { looksLikeSpam } from '@/lib/campus/spam';
import { imageUrl, shortName } from '@/lib/campus/format';

export const dynamic = 'force-dynamic';

// Inbox: only conversations the signed-in user is a party to (filter is on the session id).
export async function GET() {
  const a = await authed(); if (a instanceof NextResponse) return a;
  const { data: convs } = await a.admin.from('marketplace_conversations').select('*').or(`buyer_id.eq.${a.user.id},seller_id.eq.${a.user.id}`).order('last_message_at', { ascending: false }).limit(50);
  if (!convs?.length) return json({ items: [] });
  const cids = convs.map(c => c.id);
  const others = convs.map(c => (c.buyer_id === a.user.id ? c.seller_id : c.buyer_id));
  const [{ data: prods }, { data: profs }, { data: msgs }, { data: unread }] = await Promise.all([
    a.admin.from('marketplace_products').select('id, title, images, status, selling_price').in('id', convs.map(c => c.product_id)),
    a.admin.from('profiles').select('id, full_name').in('id', others),
    a.admin.from('marketplace_messages').select('conversation_id, message, created_at, sender_id').in('conversation_id', cids).order('created_at', { ascending: false }).limit(300),
    a.admin.from('marketplace_messages').select('conversation_id').in('conversation_id', cids).eq('receiver_id', a.user.id).is('read_at', null).limit(500)
  ]);
  const pm = new Map((prods ?? []).map(p => [p.id, p])); const nm = new Map((profs ?? []).map(p => [p.id, p.full_name]));
  const last = new Map<string, any>(); for (const m of msgs ?? []) if (!last.has(m.conversation_id)) last.set(m.conversation_id, m);
  const un = new Map<string, number>(); for (const u of unread ?? []) un.set(u.conversation_id, (un.get(u.conversation_id) ?? 0) + 1);
  return json({ items: convs.map(c => {
    const p: any = pm.get(c.product_id); const other = c.buyer_id === a.user.id ? c.seller_id : c.buyer_id;
    return { id: c.id, role: c.buyer_id === a.user.id ? 'buyer' : 'seller', other_name: shortName(nm.get(other)),
      product: p ? { id: p.id, title: p.title, image: p.images?.[0] ? imageUrl(p.images[0]) : null, status: p.status, price: Number(p.selling_price) } : null,
      last_message: last.get(c.id)?.message ?? '', last_at: c.last_message_at, unread: un.get(c.id) ?? 0 };
  }) });
}

// "Contact Seller": starts (or reuses) a conversation and posts the first message. No contact details are exchanged.
export async function POST(req: NextRequest) {
  const a = await authed({ write: true }); if (a instanceof NextResponse) return a;
  const limited = await rateLimit(`inq:${a.user.id}`, 15, 3_600_000, 'You have contacted many sellers recently. Please wait a bit.'); if (limited) return limited;
  const b = await readBody(req, inquiryInput); if ('res' in b) return b.res;
  if (looksLikeSpam(b.data.message)) return fail('That message looks like spam. Please rewrite it.');
  const { data: p } = await a.admin.from('marketplace_products').select('id, seller_id, status, contact_method').eq('id', b.data.productId).maybeSingle();
  if (!p || p.status !== 'active') return fail('This listing is no longer available.', 404);
  if (p.seller_id === a.user.id) return fail('You cannot message yourself about your own listing.', 400);
  if (p.contact_method === 'offers_only') return fail('This seller only accepts offers. Use “Make an offer” instead.', 403);

  let { data: conv } = await a.admin.from('marketplace_conversations').select('id').eq('product_id', p.id).eq('buyer_id', a.user.id).maybeSingle();
  if (!conv) {
    const ins = await a.admin.from('marketplace_conversations').insert({ product_id: p.id, buyer_id: a.user.id, seller_id: p.seller_id }).select('id').single();
    if (ins.error) { // lost a race against our own double-click: reuse the row that won
      const again = await a.admin.from('marketplace_conversations').select('id').eq('product_id', p.id).eq('buyer_id', a.user.id).maybeSingle();
      conv = again.data; if (!conv) return fail('Could not start the conversation.', 500);
    } else conv = ins.data;
  }
  const { error } = await a.admin.from('marketplace_messages').insert({ conversation_id: conv.id, sender_id: a.user.id, receiver_id: p.seller_id, message: b.data.message });
  if (error) return fail('Could not send your message.', 500);
  await a.admin.from('marketplace_conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conv.id);
  return json({ conversationId: conv.id }, 201);
}
