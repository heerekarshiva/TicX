import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  findRazorpayOrdersByReceipt, getRazorpayOrder, listRazorpayOrderPayments,
  captureRazorpayPayment, refundRazorpayPayment, type RazorpayPayment
} from '@/lib/providers/razorpay';
import type { SettleResult } from '@/lib/payments/settle';

/**
 * Verifies a paid-event registration payment SERVER-TO-SERVER with Razorpay and, only then, confirms the registration
 * (which is what releases the QR entry pass). Safe to call repeatedly (checkout callback + webhook + polling).
 * receipt = registration id, notes.kind = 'event'. The money lands in the MyTICX Razorpay account.
 */
export async function settleRazorpayEventRegistration(regId: string, rzpOrderId?: string | null): Promise<SettleResult> {
  const admin = createAdminClient();
  const { data: reg } = await admin.from('event_registrations').select('id, user_id, event_id, status, amount, events!inner(title, created_by)').eq('id', regId).maybeSingle();
  if (!reg) return 'ERROR';
  if (reg.status === 'CONFIRMED') return 'PAID';

  const rids = rzpOrderId ? [rzpOrderId] : await findRazorpayOrdersByReceipt(regId);
  if (rids.length === 0) return 'PENDING';
  const pays: RazorpayPayment[] = [];
  for (const rid of rids) {
    const o = await getRazorpayOrder(rid);
    if (o.receipt !== regId || o.notes?.kind !== 'event') return 'ERROR';
    pays.push(...await listRazorpayOrderPayments(rid));
  }
  let paid = pays.find(p => p.status === 'captured');
  if (!paid) {
    const auth = pays.find(p => p.status === 'authorized');
    if (auth && (await captureRazorpayPayment(auth.id, auth.amountPaise))) paid = { ...auth, status: 'captured' };
  }
  if (!paid) return pays.length > 0 && pays.every(p => p.status === 'failed') ? 'FAILED' : 'PENDING';

  const ev: any = (reg as any).events;
  const expectedPaise = Math.round(Number(reg.amount) * 100);
  const refund = async (why: string): Promise<SettleResult> => {
    console.error('[razorpay] EVENT PAYMENT NEEDS REFUND', { regId, paymentId: paid!.id, why });
    const r = await refundRazorpayPayment({ paymentId: paid!.id, amountPaise: paid!.amountPaise, receipt: `rf_${regId.slice(0, 30)}` });
    if (r.ok) {
      await admin.from('notifications').insert({ user_id: reg.user_id, type: 'EVENT_PAYMENT_REFUNDED', title: 'Payment refunded', body: `Your payment for ${ev.title} could not be applied, so it is being refunded in full.` });
      return 'REFUNDED';
    }
    return 'ERROR';
  };

  if (paid.amountPaise !== expectedPaise) return refund(`amount mismatch: expected ${expectedPaise}, got ${paid.amountPaise}`);
  // The seat was released (stale unpaid hold) before the money arrived — don't silently re-take a seat that may be gone.
  if (reg.status === 'CANCELLED') return refund('registration was cancelled before payment arrived');

  const { data: updated, error } = await admin.from('event_registrations')
    .update({ status: 'CONFIRMED', utr: paid.id, confirmed_at: new Date().toISOString() })
    .eq('id', regId).in('status', ['PENDING_PAYMENT', 'SUBMITTED', 'REJECTED']).select('id');
  if (error) { console.error('[razorpay] confirm registration failed', error.message); return 'ERROR'; }
  if (updated && updated.length > 0) {
    await admin.from('notifications').insert([
      { user_id: reg.user_id, type: 'EVENT_PAYMENT_CONFIRMED', title: 'Registration confirmed', body: `Payment received. You're registered for ${ev.title}. Your QR pass is ready.` },
      { user_id: ev.created_by, type: 'EVENT_REGISTRATION', title: 'Paid registration', body: `A participant paid and registered for ${ev.title}.` }
    ]);
  }
  return 'PAID';
}
