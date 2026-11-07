import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Returns what the order's buyer or seller need to see the payment step: order totals and whether Razorpay
// checkout is available. Manually enforces that the caller is either the buyer or the seller.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const admin = createAdminClient();
  const { data: order } = await admin.from('orders').select('*').eq('id', params.id).single();
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  if (order.buyer_id !== user.id && order.seller_id !== user.id) {
    return NextResponse.json({ error: 'Not authorized to view this order' }, { status: 403 });
  }

  return NextResponse.json({
    order,
    razorpayEnabled: process.env.PAYMENT_PROVIDER === 'razorpay' && !!process.env.RAZORPAY_KEY_ID && !!process.env.RAZORPAY_KEY_SECRET,
    isBuyer: order.buyer_id === user.id,
    isSeller: order.seller_id === user.id
  });
}
