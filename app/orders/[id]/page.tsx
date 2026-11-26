'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Star } from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { openRazorpayCheckout } from '@/lib/razorpay-client';

interface OrderResponse {
  order: { id: string; total_amount: number; status: string };
  razorpayEnabled?: boolean;
  isBuyer: boolean;
  isSeller: boolean;
}

export default function OrderPaymentPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<OrderResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [checking, setChecking] = useState(false);
  const [existingReview, setExistingReview] = useState<{ rating: number; comment: string | null } | null | undefined>(undefined);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  async function load() {
    const res = await fetch(`/api/orders/${id}`);
    const json = await res.json();
    if (res.ok) setData(json);
  }

  useEffect(() => { load(); }, [id]);

  // Polls our server (which re-checks with Razorpay) until the payment settles. Covers a slow callback / webhook.
  async function confirmPayment(first?: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) {
    setChecking(true);
    setError(null);
    let state = 'PENDING';
    try {
      if (first) {
        const r = await fetch('/api/payments/razorpay/verify', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId: id, ...first })
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) { setError(j.error ?? 'Could not verify the payment.'); setChecking(false); return; }
        state = j.state;
      }
      for (let tries = 0; state === 'PENDING' && tries < 12; tries++) {
        if (tries > 0 || first) await new Promise(res => setTimeout(res, 4000));
        try {
          const r = await fetch(`/api/payments/razorpay/status?orderId=${id}`);
          const j = await r.json();
          state = j.state ?? 'PENDING';
        } catch { /* keep polling */ }
      }
    } finally {
      setChecking(false);
    }
    if (state === 'PAID') { await load(); return; }
    if (state === 'REFUNDED') { setError('Payment was received but this ticket was sold to someone else. A full refund has been started and reaches your account in a few working days.'); await load(); return; }
    if (state === 'FAILED') { setError('Payment failed or was cancelled. You can try again.'); return; }
    setError("We haven't received confirmation yet. If money was deducted, it will be confirmed automatically — you can also refresh this page in a minute.");
  }

  async function payNow() {
    setPaying(true);
    setError(null);
    try {
      const res = await fetch('/api/payments/razorpay/create', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: id })
      });
      const json = await res.json();
      if (json.paid) { await load(); return; }
      if (!res.ok || !json.razorpayOrderId) { setError(json.error ?? 'Could not start the payment.'); return; }
      const out = await openRazorpayCheckout({
        keyId: json.keyId, razorpayOrderId: json.razorpayOrderId, amount: json.amount,
        description: `MyTICX order ${id.slice(0, 8)}`
      });
      if (!out.ok) { if (!out.dismissed) setError(out.error ?? 'Payment failed.'); return; }
      await confirmPayment(out.result);
    } finally {
      setPaying(false);
    }
  }

  useEffect(() => {
    if (data?.isBuyer && (data.order.status === 'PAID' || data.order.status === 'TRANSFERRED')) {
      fetch(`/api/reviews?orderId=${id}`).then(r => r.json()).then(d => setExistingReview(d.review ?? null));
    }
  }, [data, id]);

  async function submitReview() {
    if (rating < 1) { setReviewError('Pick a star rating.'); return; }
    setReviewSubmitting(true);
    setReviewError(null);
    try {
      const res = await fetch('/api/reviews', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: id, rating, comment })
      });
      const json = await res.json();
      if (!res.ok) { setReviewError(json.error ?? 'Could not submit review.'); return; }
      setExistingReview({ rating, comment });
    } finally {
      setReviewSubmitting(false);
    }
  }

  if (!data) {
    return <div><Navbar authed /><div className="container-page py-10 text-sm text-slate-500">Loading order…</div></div>;
  }

  const isPaid = data.order.status === 'PAID' || data.order.status === 'TRANSFERRED';

  return (
    <div className="pb-20 lg:pb-0">
      <Navbar authed />
      <div className="container-page max-w-lg py-8">
        <h1 className="text-xl font-bold text-navy-900">Order payment</h1>
        <p className="mt-1 text-sm text-slate-500">Total: ₹{Number(data.order.total_amount).toFixed(2)}</p>

        {isPaid && (
          <Card className="mt-4 bg-emerald-50">
            <p className="text-sm font-medium text-emerald-700">Payment confirmed. Your order is complete.</p>
          </Card>
        )}

        {isPaid && data.isBuyer && existingReview !== undefined && (
          <Card className="mt-4 space-y-3">
            <h2 className="text-sm font-semibold text-navy-900">Rate the seller</h2>
            {existingReview ? (
              <div>
                <div className="flex gap-0.5">
                  {[1, 2, 3, 4, 5].map(n => <Star key={n} className={`h-5 w-5 ${n <= existingReview.rating ? 'fill-amber-400 text-amber-400' : 'text-slate-200'}`} />)}
                </div>
                {existingReview.comment && <p className="mt-2 text-sm text-slate-600">{existingReview.comment}</p>}
                <p className="mt-1 text-xs text-slate-400">Thanks for the feedback — the chat with this seller has been cleared.</p>
              </div>
            ) : (
              <>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map(n => (
                    <button key={n} type="button" onClick={() => setRating(n)} aria-label={`${n} star`}>
                      <Star className={`h-7 w-7 transition ${n <= rating ? 'fill-amber-400 text-amber-400' : 'text-slate-200'}`} />
                    </button>
                  ))}
                </div>
                <Input placeholder="Optional comment (no contact details)" value={comment} onChange={e => setComment(e.target.value)} />
                {reviewError && <p className="text-sm text-rose-600">{reviewError}</p>}
                <Button className="w-full" onClick={submitReview} disabled={reviewSubmitting}>{reviewSubmitting ? 'Submitting…' : 'Submit review'}</Button>
                <p className="text-xs text-slate-400">Submitting clears your chat with this seller — the deal is done.</p>
              </>
            )}
          </Card>
        )}

        {!isPaid && data.isBuyer && data.razorpayEnabled && (
          <Card className="mt-4 space-y-3">
            {checking ? (
              <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-700">Confirming your payment… please don't close this page.</p>
            ) : (
              <>
                <p className="text-sm text-slate-600">Pay ₹{Number(data.order.total_amount).toFixed(2)} securely with Razorpay (UPI, cards, net banking, wallets). Your ticket is released as soon as the payment is confirmed.</p>
                {error && <p className="text-sm text-rose-600">{error}</p>}
                <Button className="w-full" onClick={payNow} disabled={paying}>{paying ? 'Opening payment…' : 'Pay now'}</Button>
              </>
            )}
          </Card>
        )}

        {!isPaid && data.isBuyer && !data.razorpayEnabled && (
          <Card className="mt-4"><p className="text-sm text-rose-600">Online payments are not available right now. Please try again later.</p></Card>
        )}

        {!isPaid && data.isSeller && (
          <Card className="mt-4"><p className="text-sm text-slate-500">Waiting for the buyer to pay. You'll be notified when it's confirmed.</p></Card>
        )}
      </div>
      <MobileBottomNav />
    </div>
  );
}
