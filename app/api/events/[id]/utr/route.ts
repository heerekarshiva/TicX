import { fail } from '@/lib/events/server';

// Retired: paid events are now paid through Razorpay (see /api/payments/razorpay/event/*). Manual UTR entry is no longer accepted.
export async function POST() {
  return fail('Manual payment references are no longer accepted. Please pay online with Razorpay.', 410);
}
