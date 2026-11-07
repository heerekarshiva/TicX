import { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireUser, sameOrigin, limited, fail, json } from '@/lib/events/server';
import { createRazorpayOrder, razorpayConfigured, razorpayKeyId } from '@/lib/providers/razorpay';
import { settleRazorpayEventRegistration } from '@/lib/payments/event-settle';

// Participant clicks "Pay now" on a paid event: the amount comes from OUR registration row, never the client.
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return fail('Bad origin.', 403);
  const user = await requireUser();
  if (!user) return fail('Please log in.', 401);
  if (!razorpayConfigured()) return fail('Payments are not configured yet.', 503);
  if (limited(req, 'rzp-event-create', user.id, 10)) return fail('Too many attempts. Please wait a minute.', 429);
  const body = await req.json().catch(() => null);
  const registrationId = body?.registrationId;
  if (typeof registrationId !== 'string' || !/^[0-9a-f-]{36}$/i.test(registrationId)) return fail('Invalid request.');

  const admin = createAdminClient();
  const { data: reg } = await admin.from('event_registrations').select('id, user_id, status, amount').eq('id', registrationId).maybeSingle();
  if (!reg || reg.user_id !== user.id) return fail('Registration not found.', 404);
  if (reg.status === 'CONFIRMED') return json({ paid: true });
  if (reg.status === 'CANCELLED') return fail('This registration expired. Please register again.', 409);
  if (!(Number(reg.amount) > 0)) return fail('Nothing to pay for this registration.', 409);

  try { if ((await settleRazorpayEventRegistration(reg.id)) === 'PAID') return json({ paid: true }); } catch { /* fresh checkout below */ }

  try {
    const { razorpayOrderId, amountPaise } = await createRazorpayOrder({
      receipt: reg.id, amountRupees: Number(reg.amount), notes: { kind: 'event', registration_id: reg.id }
    });
    return json({ keyId: razorpayKeyId(), razorpayOrderId, amount: amountPaise, currency: 'INR' });
  } catch (e) {
    console.error('[razorpay] event create failed', e);
    return fail('Could not start the payment. Please try again.', 502);
  }
}
