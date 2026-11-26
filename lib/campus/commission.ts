// Commission is OPTIONAL and OFF by default (rate 0). It is calculated ONLY for transactions that were verified
// through a supported payment / confirmation workflow. Listing a product or accepting an offer never produces a
// commission. The database also enforces: commission_amount may only be set when verified = true.
export interface TxForCommission { verified: boolean; amount: number; payment_reference?: string | null }

export function computeCommission(tx: TxForCommission, ratePercent: number): number | null {
  if (!tx.verified || !tx.payment_reference) return null;   // no verified payment => no commission
  if (!(ratePercent > 0) || ratePercent > 50) return null;  // disabled or implausible rate
  return Math.round(tx.amount * ratePercent) / 100;
}
