import 'server-only';
import { createHmac, timingSafeEqual } from 'crypto';

// Razorpay Standard Checkout (Orders API). No SDK needed: plain REST with HTTP Basic auth.
// Docs: https://razorpay.com/docs/payments/server-integration/nodejs/payment-gateway/build-integration/
//
// Flow: server creates an order (amount comes from OUR database) -> browser opens Checkout with that order id ->
// browser returns payment_id + signature -> server verifies the signature AND re-fetches the payment from Razorpay
// before anything is marked paid. The webhook (payment.captured / payment.failed) is the safety net.

const API = 'https://api.razorpay.com/v1';

export function razorpayConfigured(): boolean {
  return !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

export const razorpayKeyId = () => process.env.RAZORPAY_KEY_ID ?? '';

function authHeader(): string {
  const id = process.env.RAZORPAY_KEY_ID ?? '';
  const secret = process.env.RAZORPAY_KEY_SECRET ?? '';
  return 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64');
}

async function rzp<T = any>(path: string, init?: { method?: string; body?: unknown }): Promise<{ ok: boolean; status: number; json: T }> {
  const res = await fetch(`${API}${path}`, {
    method: init?.method ?? 'GET',
    headers: { Authorization: authHeader(), 'Content-Type': 'application/json' },
    body: init?.body ? JSON.stringify(init.body) : undefined,
    cache: 'no-store'
  });
  const json: any = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

const errText = (j: any) => j?.error?.description ?? j?.error?.code ?? '';

/** Creates a Razorpay order. receipt = our own id (<= 40 chars; a UUID is 36). Amount in rupees, sent as paise. */
export async function createRazorpayOrder(p: { receipt: string; amountRupees: number; notes: Record<string, string> }) {
  const r = await rzp('/orders', {
    method: 'POST',
    body: { amount: Math.round(p.amountRupees * 100), currency: 'INR', receipt: p.receipt, notes: p.notes }
  });
  if (!r.ok || !r.json?.id) throw new Error(`Razorpay create order failed (${r.status}): ${errText(r.json)}`);
  return { razorpayOrderId: String(r.json.id), amountPaise: Number(r.json.amount) };
}

export async function getRazorpayOrder(razorpayOrderId: string): Promise<{ id: string; receipt: string | null; amountPaise: number; notes: Record<string, string> }> {
  const r = await rzp(`/orders/${encodeURIComponent(razorpayOrderId)}`);
  if (!r.ok) throw new Error(`Razorpay order fetch failed (${r.status})`);
  return { id: r.json.id, receipt: r.json.receipt ?? null, amountPaise: Number(r.json.amount ?? 0), notes: r.json.notes && !Array.isArray(r.json.notes) ? r.json.notes : {} };
}

/** Every Razorpay order we created for a receipt (our order / registration id). A buyer may open checkout more than once. */
export async function findRazorpayOrdersByReceipt(receipt: string): Promise<string[]> {
  const r = await rzp(`/orders?receipt=${encodeURIComponent(receipt)}&count=20`);
  if (!r.ok) return [];
  return (r.json?.items ?? []).filter((x: any) => x.receipt === receipt).map((x: any) => String(x.id));
}

export type RazorpayPayment = { id: string; status: string; amountPaise: number; orderId: string | null };

export async function getRazorpayPayment(paymentId: string): Promise<RazorpayPayment> {
  const r = await rzp(`/payments/${encodeURIComponent(paymentId)}`);
  if (!r.ok) throw new Error(`Razorpay payment fetch failed (${r.status})`);
  return { id: r.json.id, status: r.json.status, amountPaise: Number(r.json.amount ?? 0), orderId: r.json.order_id ?? null };
}

export async function listRazorpayOrderPayments(razorpayOrderId: string): Promise<RazorpayPayment[]> {
  const r = await rzp(`/orders/${encodeURIComponent(razorpayOrderId)}/payments`);
  if (!r.ok) throw new Error(`Razorpay order payments failed (${r.status})`);
  return (r.json?.items ?? []).map((x: any) => ({ id: x.id, status: x.status, amountPaise: Number(x.amount ?? 0), orderId: x.order_id ?? null }));
}

/** If the account is on manual capture, an "authorized" payment must be captured or it auto-refunds after ~5 days. */
export async function captureRazorpayPayment(paymentId: string, amountPaise: number): Promise<boolean> {
  const r = await rzp(`/payments/${encodeURIComponent(paymentId)}/capture`, { method: 'POST', body: { amount: amountPaise, currency: 'INR' } });
  return r.ok;
}

/** Refund a captured payment. Idempotent per payment via the receipt we send. */
export async function refundRazorpayPayment(p: { paymentId: string; amountPaise: number; receipt: string }): Promise<{ ok: boolean; state?: string; error?: string }> {
  try {
    const r = await rzp(`/payments/${encodeURIComponent(p.paymentId)}/refund`, { method: 'POST', body: { amount: p.amountPaise, speed: 'normal', receipt: p.receipt.slice(0, 40) } });
    if (r.ok) return { ok: true, state: r.json?.status };
    // Already fully refunded counts as success so retries stay safe.
    const desc = String(errText(r.json));
    if (/already.*refund|fully refunded/i.test(desc)) return { ok: true, state: 'processed' };
    return { ok: false, error: `${r.status} ${desc}` };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

function safeEqualHex(a: string, b: string): boolean {
  const x = Buffer.from(a); const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Checkout success callback: signature = HMAC_SHA256(order_id + "|" + payment_id, key_secret). */
export function verifyCheckoutSignature(p: { razorpayOrderId: string; razorpayPaymentId: string; signature: string }): boolean {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret || !p.signature) return false;
  const expected = createHmac('sha256', secret).update(`${p.razorpayOrderId}|${p.razorpayPaymentId}`).digest('hex');
  return safeEqualHex(expected, p.signature.trim().toLowerCase());
}

/** Webhook: X-Razorpay-Signature = HMAC_SHA256(raw request body, webhook secret). */
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  return safeEqualHex(expected, signature.trim().toLowerCase());
}
