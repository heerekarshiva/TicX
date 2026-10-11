import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  findRazorpayOrdersByReceipt, getRazorpayOrder, listRazorpayOrderPayments, getRazorpayPayment,
  captureRazorpayPayment, refundRazorpayPayment, type RazorpayPayment
} from '@/lib/providers/razorpay';

export type SettleResult = 'PAID' | 'PENDING' | 'FAILED' | 'REFUNDED' | 'ERROR';

const MAX_REFUND_ATTEMPTS = 10;

/** The captured Razorpay payment for one of our orders (looked up by receipt = our order id). */
async function findCapturedPayment(orderId: string): Promise<RazorpayPayment | null> {
  const pays: RazorpayPayment[] = [];
  for (const rid of await findRazorpayOrdersByReceipt(orderId)) pays.push(...await listRazorpayOrderPayments(rid));
  return pays.find(p => p.status === 'captured') ?? pays.find(p => p.status === 'refunded') ?? null;
}

/** Calls Razorpay's refund API for an issue row and records the outcome. Safe to repeat. */
async function attemptRefund(orderId: string, kind: string, amountPaise: number, prevAttempts: number): Promise<SettleResult> {
  const admin = createAdminClient();
  let r: { ok: boolean; state?: string; error?: string };
  try {
    const pay = await findCapturedPayment(orderId);
    if (!pay) r = { ok: false, error: 'No captured Razorpay payment found for this order.' };
    else if (pay.status === 'refunded') r = { ok: true, state: 'refunded' };
    else r = await refundRazorpayPayment({ paymentId: pay.id, amountPaise, receipt: `rf_${orderId.slice(0, 30)}` });
  } catch (e) { r = { ok: false, error: (e as Error).message }; }
  await admin.from('payment_issues').update({
    refund_status: r.ok ? 'REFUND_INITIATED' : 'REFUND_FAILED',
    refund_attempts: prevAttempts + 1,
    last_attempt_at: new Date().toISOString(),
    last_error: r.ok ? null : String(r.error ?? 'unknown').slice(0, 500)
  }).eq('order_id', orderId).eq('kind', kind);
  if (r.ok) {
    await admin.from('orders').update({ status: 'REFUNDED', updated_at: new Date().toISOString() }).eq('id', orderId).in('status', ['CANCELLED', 'PAYMENT_PENDING', 'FAILED']);
    await admin.from('payments').update({ status: 'REFUNDED' }).eq('order_id', orderId).eq('status', 'SUCCEEDED');
  }
  return r.ok ? 'REFUNDED' : 'ERROR';
}

async function recordIssueAndRefund(orderId: string, kind: string, amountPaise: number, detail: string): Promise<SettleResult> {
  const admin = createAdminClient();
  const { error: insErr } = await admin.from('payment_issues').insert({ order_id: orderId, kind, amount: amountPaise / 100, detail });
  if (insErr && insErr.code !== '23505') console.error('[razorpay] could not record payment issue', insErr.message);
  console.error('[razorpay] PAYMENT ISSUE', { orderId, kind, detail });
  const { data: row } = await admin.from('payment_issues').select('refund_attempts').eq('order_id', orderId).eq('kind', kind).maybeSingle();
  return attemptRefund(orderId, kind, amountPaise, row?.refund_attempts ?? 0);
}

/** Cron: retry refunds that failed or never got sent (bounded attempts, spaced out). Returns how many succeeded. */
export async function retryOpenRefunds(limit = 20): Promise<number> {
  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - 2 * 60_000).toISOString();
  const { data } = await admin.from('payment_issues').select('order_id, kind, amount, refund_attempts')
    .in('refund_status', ['PENDING', 'REFUND_FAILED']).lt('refund_attempts', MAX_REFUND_ATTEMPTS)
    .or(`last_attempt_at.is.null,last_attempt_at.lt.${cutoff}`).order('created_at').limit(limit);
  let ok = 0;
  for (const i of data ?? []) {
    try { if ((await attemptRefund(i.order_id, i.kind, Math.round(Number(i.amount) * 100), i.refund_attempts ?? 0)) === 'REFUNDED') ok++; }
    catch (e) { console.error('[refund-retry] failed', i.order_id, e); }
  }
  return ok;
}

/** Admin button: retry one refund now, regardless of the automatic attempt limit. */
export async function retryRefundNow(issueId: string): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient();
  const { data: i } = await admin.from('payment_issues').select('order_id, kind, amount, refund_attempts, refund_status').eq('id', issueId).maybeSingle();
  if (!i) return { ok: false, error: 'Issue not found.' };
  if (i.refund_status === 'REFUND_INITIATED' || i.refund_status === 'RESOLVED') return { ok: false, error: 'Already refunded.' };
  const r = await attemptRefund(i.order_id, i.kind, Math.round(Number(i.amount) * 100), i.refund_attempts ?? 0);
  return r === 'REFUNDED' ? { ok: true } : { ok: false, error: 'Razorpay refused the refund. See the error on the issue.' };
}

/** Safety net: make sure a Razorpay-collected, paid order has its payout row (finalize_paid_order normally creates it). */
async function ensurePayout(order: { id: string; seller_id: string; ticket_price: number }) {
  const admin = createAdminClient();
  const { data: pay } = await admin.from('payments').select('id').eq('order_id', order.id).eq('provider', 'razorpay').in('status', ['SUCCEEDED']).limit(1).maybeSingle();
  if (!pay) return;
  const { error } = await admin.from('seller_payouts').insert({ order_id: order.id, seller_id: order.seller_id, amount: order.ticket_price });
  if (error && error.code !== '23505') console.error('[payout] could not create payout row', order.id, error.message);
}

/**
 * Verifies a Razorpay payment SERVER-TO-SERVER (never trusts a webhook body or the browser callback),
 * checks the amount against our own order, records it once, and finalizes the order.
 * Safe to call repeatedly (checkout callback + webhook + polling) and concurrently.
 * If money was taken but the ticket is gone, the buyer is refunded automatically and the case is logged in payment_issues.
 *
 * `rzpOrderId` (optional) is the Razorpay order id the browser/webhook reported. It is never trusted on its own:
 * we re-fetch it from Razorpay and require its receipt to equal OUR order id.
 */
export async function settleRazorpayOrder(orderId: string, rzpOrderId?: string | null): Promise<SettleResult> {
  const admin = createAdminClient();
  const { data: order } = await admin.from('orders').select('id, total_amount, status, seller_id, ticket_price').eq('id', orderId).maybeSingle();
  if (!order) return 'ERROR';
  if (order.status === 'PAID' || order.status === 'TRANSFERRED') { await ensurePayout(order as any); return 'PAID'; }
  if (order.status === 'REFUNDED') return 'REFUNDED';

  const { data: issue } = await admin.from('payment_issues').select('refund_status').eq('order_id', orderId).limit(1).maybeSingle();
  if (issue) return issue.refund_status === 'REFUND_INITIATED' || issue.refund_status === 'RESOLVED' ? 'REFUNDED' : 'ERROR'; // failed refunds are retried by cron / the admin button

  const rids = rzpOrderId ? [rzpOrderId] : await findRazorpayOrdersByReceipt(orderId);
  if (rids.length === 0) return 'PENDING'; // buyer has not opened checkout yet
  const pays: RazorpayPayment[] = [];
  for (const rid of rids) {
    const rzpOrder = await getRazorpayOrder(rid);
    if (rzpOrder.receipt !== orderId) return 'ERROR'; // someone else's Razorpay order — never settle against it
    pays.push(...await listRazorpayOrderPayments(rid));
  }
  let paid = pays.find(p => p.status === 'captured');
  if (!paid) {
    const auth = pays.find(p => p.status === 'authorized');
    if (auth && (await captureRazorpayPayment(auth.id, auth.amountPaise))) paid = { ...auth, status: 'captured' };
  }
  if (!paid) return pays.length > 0 && pays.every(p => p.status === 'failed') ? 'FAILED' : 'PENDING';

  const expectedPaise = Math.round(Number(order.total_amount) * 100);
  if (paid.amountPaise !== expectedPaise) return recordIssueAndRefund(orderId, 'AMOUNT_MISMATCH', paid.amountPaise, `expected ${expectedPaise}, got ${paid.amountPaise}`);

  const { error: payErr } = await admin.from('payments').insert({
    order_id: orderId, provider: 'razorpay', provider_payment_id: paid.id, amount: order.total_amount,
    status: 'SUCCEEDED', idempotency_key: `razorpay_${orderId}`, raw_webhook_payload: { source: 'razorpay_api', razorpay_order_id: paid.orderId, status: paid.status }
  });
  if (payErr && payErr.code !== '23505') { console.error('[razorpay] record payment failed', payErr.message); return 'ERROR'; }

  const { error: finErr } = await admin.rpc('finalize_paid_order', { p_order_id: orderId });
  if (finErr) {
    // Paid, but the ticket is no longer available (sold to someone else). Refund automatically.
    return recordIssueAndRefund(orderId, 'ORDER_NOT_PAYABLE', paid.amountPaise, finErr.message);
  }

  await ensurePayout(order as any); // normally already created inside finalize_paid_order
  return 'PAID';
}

/** Used by the webhook to look up which of our orders a Razorpay payment belongs to. */
export async function resolveOrderFromPayment(paymentId: string): Promise<{ kind: 'order' | 'event'; id: string; rzpOrderId: string } | null> {
  const pay = await getRazorpayPayment(paymentId);
  if (!pay.orderId) return null;
  const o = await getRazorpayOrder(pay.orderId);
  if (!o.receipt) return null;
  return { kind: o.notes?.kind === 'event' ? 'event' : 'order', id: o.receipt, rzpOrderId: pay.orderId };
}
