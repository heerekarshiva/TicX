import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createRazorpayOrder, razorpayConfigured, razorpayKeyId } from '@/lib/providers/razorpay';
import { checkRateLimitShared } from '@/lib/rate-limit';
import { planHold } from '@/lib/payments/hold';
import { settleRazorpayOrder } from '@/lib/payments/settle';

// Buyer clicks "Pay now": we create the Razorpay order from OUR order (amount comes from the DB, never the client).
export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!razorpayConfigured()) return NextResponse.json({ error: 'Payments are not configured yet.' }, { status: 503 });

  const { orderId } = await req.json().catch(() => ({}));
  if (typeof orderId !== 'string') return NextResponse.json({ error: 'orderId required' }, { status: 400 });

  if (!(await checkRateLimitShared(`rzp-create:${user.id}`, 10, 60_000))) return NextResponse.json({ error: 'Too many attempts. Please wait a minute.' }, { status: 429 });

  const admin = createAdminClient();
  const { data: order } = await admin.from('orders').select('id, listing_id, buyer_id, total_amount, status').eq('id', orderId).maybeSingle();
  if (!order || order.buyer_id !== user.id) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  if (order.status === 'PAID' || order.status === 'TRANSFERRED') return NextResponse.json({ paid: true });
  if (order.status !== 'PAYMENT_PENDING') return NextResponse.json({ error: 'This order is not awaiting payment.' }, { status: 409 });

  // If an earlier checkout already captured money (webhook not yet processed), settle it instead of charging twice.
  try { if ((await settleRazorpayOrder(order.id)) === 'PAID') return NextResponse.json({ paid: true }); } catch { /* fall through to a fresh checkout */ }

  // Never take money for a reservation that has lapsed or a ticket someone else now holds.
  const { data: listing } = await admin.from('ticket_listings').select('status, reserved_by, reserved_at, reservation_expires_at').eq('id', order.listing_id).maybeSingle();
  const expiresMs = listing?.reservation_expires_at ? new Date(listing.reservation_expires_at).getTime() : 0;
  if (!listing || listing.status !== 'RESERVED' || listing.reserved_by !== user.id) {
    return NextResponse.json({ error: 'Your reservation has expired or this ticket is no longer available. Please go back and try again.' }, { status: 409 });
  }
  // If the reservation is nearly over, extend the buyer's own hold (capped) so they have time to finish paying.
  const now = Date.now();
  const plan = planHold({ nowMs: now, expiresAtMs: expiresMs, reservedAtMs: listing.reserved_at ? new Date(listing.reserved_at).getTime() : null });
  if (!plan.ok) return NextResponse.json({ error: 'Your reservation has expired or this ticket is no longer available. Please go back and try again.' }, { status: 409 });
  if (plan.extend) {
    const { data: ext } = await admin.from('ticket_listings')
      .update({ reservation_expires_at: new Date(plan.newExpiresAtMs).toISOString(), updated_at: new Date().toISOString() })
      .eq('id', order.listing_id).eq('status', 'RESERVED').eq('reserved_by', user.id).gt('reservation_expires_at', new Date(now).toISOString())
      .select('id');
    if (!ext || ext.length === 0) return NextResponse.json({ error: 'Your reservation has expired or this ticket is no longer available. Please go back and try again.' }, { status: 409 });
  }

  try {
    const { razorpayOrderId, amountPaise } = await createRazorpayOrder({
      receipt: order.id, amountRupees: Number(order.total_amount), notes: { kind: 'ticket', order_id: order.id }
    });
    return NextResponse.json({ keyId: razorpayKeyId(), razorpayOrderId, amount: amountPaise, currency: 'INR' });
  } catch (e) {
    console.error('[razorpay] create failed', e);
    return NextResponse.json({ error: 'Could not start the payment. Please try again.' }, { status: 502 });
  }
}
