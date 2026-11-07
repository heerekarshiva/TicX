import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyCheckoutSignature } from '@/lib/providers/razorpay';
import { settleRazorpayOrder } from '@/lib/payments/settle';

// Called by the browser right after Razorpay Checkout succeeds. The signature is checked, then the payment is
// re-verified with Razorpay's API before the order is marked paid (the browser's word alone is never enough).
export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const b: any = await req.json().catch(() => ({}));
  const { orderId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = b;
  if ([orderId, razorpay_order_id, razorpay_payment_id, razorpay_signature].some(v => typeof v !== 'string' || !v)) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  const { data: order } = await createAdminClient().from('orders').select('buyer_id').eq('id', orderId).maybeSingle();
  if (!order || order.buyer_id !== user.id) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  if (!verifyCheckoutSignature({ razorpayOrderId: razorpay_order_id, razorpayPaymentId: razorpay_payment_id, signature: razorpay_signature })) {
    return NextResponse.json({ error: 'Payment signature could not be verified.' }, { status: 400 });
  }
  try { return NextResponse.json({ state: await settleRazorpayOrder(orderId, razorpay_order_id) }); }
  catch (e) { console.error('[razorpay] verify failed', e); return NextResponse.json({ state: 'PENDING' }); }
}
