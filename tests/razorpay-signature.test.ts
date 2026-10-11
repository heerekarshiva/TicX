import { describe, it, expect, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { createHmac } from 'crypto';
describe('razorpay signatures', () => {
  it('verifies checkout + webhook signatures and rejects tampering', async () => {
    process.env.RAZORPAY_KEY_SECRET = 'sek'; process.env.RAZORPAY_WEBHOOK_SECRET = 'whsec';
    const { verifyCheckoutSignature, verifyWebhookSignature } = await import('@/lib/providers/razorpay');
    const good = createHmac('sha256', 'sek').update('order_1|pay_1').digest('hex');
    expect(verifyCheckoutSignature({ razorpayOrderId: 'order_1', razorpayPaymentId: 'pay_1', signature: good })).toBe(true);
    expect(verifyCheckoutSignature({ razorpayOrderId: 'order_1', razorpayPaymentId: 'pay_2', signature: good })).toBe(false);
    expect(verifyCheckoutSignature({ razorpayOrderId: 'order_1', razorpayPaymentId: 'pay_1', signature: '' })).toBe(false);
    const body = '{"a":1}'; const wh = createHmac('sha256', 'whsec').update(body).digest('hex');
    expect(verifyWebhookSignature(body, wh)).toBe(true);
    expect(verifyWebhookSignature(body + ' ', wh)).toBe(false);
    expect(verifyWebhookSignature(body, null)).toBe(false);
  });
});
