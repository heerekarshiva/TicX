import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authed, json, fail, readBody, rateLimit } from '@/lib/campus/server';
import { offerAction } from '@/lib/campus/schemas';

export const dynamic = 'force-dynamic';

// accept / reject: the SELLER of the offer.  withdraw: the BUYER.  complete: the SELLER, after the handover.
// Accepting an offer does NOT mean payment happened and does NOT sell the item. No escrow exists.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!z.string().uuid().safeParse(params.id).success) return fail('Offer not found.', 404);
  const a = await authed({ write: true }); if (a instanceof NextResponse) return a;
  const limited = await rateLimit(`offeract:${a.user.id}`, 60, 60_000); if (limited) return limited;
  const b = await readBody(req, offerAction); if ('res' in b) return b.res;
  const { data: o } = await a.admin.from('marketplace_offers').select('*').eq('id', params.id).or(`buyer_id.eq.${a.user.id},seller_id.eq.${a.user.id}`).maybeSingle();
  if (!o) return fail('Offer not found.', 404);
  const isSeller = o.seller_id === a.user.id; const now = new Date().toISOString();
  const note = async (text: string, to: string) => { if (o.conversation_id) {
    await a.admin.from('marketplace_messages').insert({ conversation_id: o.conversation_id, sender_id: a.user.id, receiver_id: to, message: text });
    await a.admin.from('marketplace_conversations').update({ last_message_at: now }).eq('id', o.conversation_id); } };
  const { action } = b.data;

  if (action === 'accept' || action === 'reject') {
    if (!isSeller) return fail('Only the seller can respond to an offer.', 403);
    if (o.status !== 'pending') return fail('This offer has already been answered.', 409);
    const { data: p } = await a.admin.from('marketplace_products').select('status').eq('id', o.product_id).maybeSingle();
    if (!p || p.status !== 'active') return fail('This listing is not active.', 409);
    const status = action === 'accept' ? 'accepted' : 'rejected';
    const { error } = await a.admin.from('marketplace_offers').update({ status, responded_at: now }).eq('id', o.id).eq('seller_id', a.user.id).eq('status', 'pending');
    if (error) return fail('Could not update the offer.', 500);
    await note(action === 'accept' ? `I accepted your offer of ₹${Number(o.offered_price).toLocaleString('en-IN')}. Let’s arrange the handover here.` : 'I declined your offer.', o.buyer_id);
    return json({ status });
  }
  if (action === 'withdraw') {
    if (isSeller) return fail('Only the buyer can withdraw an offer.', 403);
    if (!['pending', 'accepted'].includes(o.status)) return fail('This offer can no longer be withdrawn.', 409);
    await a.admin.from('marketplace_offers').update({ status: 'withdrawn', responded_at: now }).eq('id', o.id).eq('buyer_id', a.user.id);
    await note('I withdrew my offer.', o.seller_id);
    return json({ status: 'withdrawn' });
  }
  // complete
  if (!isSeller) return fail('Only the seller can mark a transaction as completed.', 403);
  const { data: tx, error } = await a.admin.rpc('marketplace_complete_offer', { p_offer: o.id, p_seller: a.user.id });
  if (error) {
    const m = error.message ?? '';
    if (m.includes('OFFER_NOT_ACCEPTED')) return fail('Accept the offer before completing the transaction.', 409);
    if (m.includes('PRODUCT_NOT_AVAILABLE')) return fail('This listing is no longer available.', 409);
    return fail('Could not complete the transaction.', 500);
  }
  await note('Marked as completed. Thanks!', o.buyer_id);
  return json({ status: 'completed', transactionId: tx });
}
