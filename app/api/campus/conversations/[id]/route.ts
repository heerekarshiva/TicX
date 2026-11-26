import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authed, json, fail, readBody, rateLimit } from '@/lib/campus/server';
import { messageInput } from '@/lib/campus/schemas';
import { looksLikeSpam } from '@/lib/campus/spam';
import { imageUrl, shortName } from '@/lib/campus/format';

export const dynamic = 'force-dynamic';
const uuid = z.string().uuid();

// A conversation is returned ONLY if the session user is its buyer or seller; otherwise 404 (no existence leak).
async function load(a: Exclude<Awaited<ReturnType<typeof authed>>, NextResponse>, id: string) {
  if (!uuid.safeParse(id).success) return null;
  const { data } = await a.admin.from('marketplace_conversations').select('*').eq('id', id).or(`buyer_id.eq.${a.user.id},seller_id.eq.${a.user.id}`).maybeSingle();
  return data;
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const a = await authed(); if (a instanceof NextResponse) return a;
  const conv = await load(a, params.id); if (!conv) return fail('Conversation not found.', 404);
  const other = conv.buyer_id === a.user.id ? conv.seller_id : conv.buyer_id;
  const [{ data: msgs }, { data: prod }, { data: prof }, { data: offers }] = await Promise.all([
    a.admin.from('marketplace_messages').select('id, sender_id, message, created_at').eq('conversation_id', conv.id).order('created_at', { ascending: true }).limit(300),
    a.admin.from('marketplace_products').select('id, title, images, status, selling_price').eq('id', conv.product_id).maybeSingle(),
    a.admin.from('profiles').select('full_name').eq('id', other).maybeSingle(),
    a.admin.from('marketplace_offers').select('id, offered_price, status, created_at').eq('product_id', conv.product_id).eq('buyer_id', conv.buyer_id).order('created_at', { ascending: false }).limit(10)
  ]);
  await a.admin.from('marketplace_messages').update({ read_at: new Date().toISOString() }).eq('conversation_id', conv.id).eq('receiver_id', a.user.id).is('read_at', null);
  return json({
    role: conv.buyer_id === a.user.id ? 'buyer' : 'seller', other_name: shortName(prof?.full_name),
    product: prod ? { id: prod.id, title: prod.title, image: prod.images?.[0] ? imageUrl(prod.images[0]) : null, status: prod.status, price: Number(prod.selling_price) } : null,
    messages: (msgs ?? []).map(m => ({ id: m.id, mine: m.sender_id === a.user.id, message: m.message, created_at: m.created_at })),
    offers: (offers ?? []).map(o => ({ ...o, offered_price: Number(o.offered_price) }))
  });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const a = await authed({ write: true }); if (a instanceof NextResponse) return a;
  const limited = await rateLimit(`msg:${a.user.id}`, 30, 60_000, 'You are sending messages too fast.'); if (limited) return limited;
  const conv = await load(a, params.id); if (!conv) return fail('Conversation not found.', 404);
  const b = await readBody(req, messageInput); if ('res' in b) return b.res;
  if (looksLikeSpam(b.data.message)) return fail('That message looks like spam. Please rewrite it.');
  const { data: prod } = await a.admin.from('marketplace_products').select('status').eq('id', conv.product_id).maybeSingle();
  if (!prod || prod.status === 'removed') return fail('This listing was removed. The conversation is closed.', 409);
  const receiver = conv.buyer_id === a.user.id ? conv.seller_id : conv.buyer_id;   // derived, never client-supplied
  const { data: msg, error } = await a.admin.from('marketplace_messages').insert({ conversation_id: conv.id, sender_id: a.user.id, receiver_id: receiver, message: b.data.message }).select('id, created_at').single();
  if (error) return fail('Could not send your message.', 500);
  await a.admin.from('marketplace_conversations').update({ last_message_at: msg.created_at }).eq('id', conv.id);
  return json({ id: msg.id, created_at: msg.created_at }, 201);
}
