import { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireUser, sameOrigin, limited, fail, json } from '@/lib/events/server';
import { verifyCheckoutSignature } from '@/lib/providers/razorpay';
import { settleRazorpayEventRegistration } from '@/lib/payments/event-settle';

// Browser callback after Razorpay Checkout (or polling when no payload is sent). Confirms ONLY after Razorpay itself says the money is captured.
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return fail('Bad origin.', 403);
  const user = await requireUser();
  if (!user) return fail('Please log in.', 401);
  if (limited(req, 'rzp-event-verify', user.id, 30)) return fail('Too many attempts.', 429);
  const b: any = await req.json().catch(() => null);
  const registrationId = b?.registrationId;
  if (typeof registrationId !== 'string' || !/^[0-9a-f-]{36}$/i.test(registrationId)) return fail('Invalid request.');
  const { data: reg } = await createAdminClient().from('event_registrations').select('user_id').eq('id', registrationId).maybeSingle();
  if (!reg || reg.user_id !== user.id) return fail('Registration not found.', 404);

  let rzpOrderId: string | undefined;
  if (b.razorpay_order_id || b.razorpay_payment_id || b.razorpay_signature) {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = b;
    if ([razorpay_order_id, razorpay_payment_id, razorpay_signature].some(v => typeof v !== 'string' || !v)) return fail('Invalid request.');
    if (!verifyCheckoutSignature({ razorpayOrderId: razorpay_order_id, razorpayPaymentId: razorpay_payment_id, signature: razorpay_signature })) return fail('Payment signature could not be verified.', 400);
    rzpOrderId = razorpay_order_id;
  }
  try { return json({ state: await settleRazorpayEventRegistration(registrationId, rzpOrderId) }); }
  catch (e) { console.error('[razorpay] event verify failed', e); return json({ state: 'PENDING' }); }
}
