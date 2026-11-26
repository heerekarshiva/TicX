// Payment seam for Campus Marketplace. NOTHING is wired today: promotions are confirmed manually by an admin
// (Admin → Campus → Promotions) and no escrow / buyer protection exists. To add a gateway later, implement
// CampusPaymentProvider (e.g. wrap lib/providers/razorpay.ts), return it from getCampusPaymentProvider(), and have
// its webhook set marketplace_promotions.payment_status = 'paid' / marketplace_transactions.verified = true.
export interface CampusPaymentProvider {
  name: string;
  createPromotionPayment(input: { promotionId: string; amount: number; sellerId: string }): Promise<{ checkoutUrl: string; reference: string }>;
  verifyPayment(reference: string): Promise<{ paid: boolean; amount: number }>;
}
export function getCampusPaymentProvider(): CampusPaymentProvider | null { return null; }
