import { NextRequest, NextResponse } from 'next/server';
import { verifyWebhookSignature } from '@/lib/providers/razorpay';
import { settleRazorpayOrder, resolveOrderFromPayment } from '@/lib/payments/settle';
import { settleRazorpayEventRegistration } from '@/lib/payments/event-settle';

// Razorpay Dashboard -> Settings -> Webhooks -> add https://<your-domain>/api/payments/razorpay/webhook
// Events: payment.captured, payment.authorized, payment.failed. Use the secret you put in RAZORPAY_WEBHOOK_SECRET.
// The body is never trusted: we only use it to learn WHICH payment to re-check with Razorpay's API.
export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!verifyWebhookSignature(raw, req.headers.get('x-razorpay-signature'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  let body: any = null;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ ok: true }); }
  const paymentId = body?.payload?.payment?.entity?.id;
  if (!paymentId || typeof paymentId !== 'string') return NextResponse.json({ ok: true });

  try {
    const target = await resolveOrderFromPayment(paymentId);
    if (!target) return NextResponse.json({ ok: true });
    if (target.kind === 'event') await settleRazorpayEventRegistration(target.id, target.rzpOrderId);
    else await settleRazorpayOrder(target.id, target.rzpOrderId);
  } catch (e) {
    console.error('[razorpay] webhook settle error', e);
    return NextResponse.json({ error: 'retry' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
