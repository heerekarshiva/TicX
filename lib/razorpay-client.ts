// Browser-side helper for Razorpay Standard Checkout (no QR code, no UTR typing — the buyer pays inside Razorpay's own popup).

declare global { interface Window { Razorpay?: new (opts: any) => { open: () => void; on: (ev: string, cb: (r: any) => void) => void } } }

let loading: Promise<boolean> | null = null;
export function loadRazorpay(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  if (window.Razorpay) return Promise.resolve(true);
  if (loading) return loading;
  loading = new Promise<boolean>(resolve => {
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.async = true;
    s.onload = () => resolve(true);
    s.onerror = () => { loading = null; resolve(false); };
    document.body.appendChild(s);
  });
  return loading;
}

export interface RazorpaySuccess { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }

/** Opens the Razorpay popup for a server-created order. Resolves with the signed result, or null if the buyer closed it. */
export async function openRazorpayCheckout(p: {
  keyId: string; razorpayOrderId: string; amount: number; description: string;
  prefill?: { email?: string; name?: string };
}): Promise<{ ok: true; result: RazorpaySuccess } | { ok: false; dismissed?: boolean; error?: string }> {
  if (!(await loadRazorpay()) || !window.Razorpay) return { ok: false, error: 'Could not load the payment window. Check your connection and try again.' };
  return new Promise(resolve => {
    const rzp = new window.Razorpay!({
      key: p.keyId,
      order_id: p.razorpayOrderId,
      amount: p.amount,
      currency: 'INR',
      name: 'MyTICX',
      description: p.description,
      prefill: p.prefill,
      theme: { color: '#FF7A00' },
      handler: (r: RazorpaySuccess) => resolve({ ok: true, result: r }),
      modal: { ondismiss: () => resolve({ ok: false, dismissed: true }) }
    });
    rzp.on('payment.failed', (r: any) => resolve({ ok: false, error: r?.error?.description ?? 'Payment failed. You can try again.' }));
    rzp.open();
  });
}
