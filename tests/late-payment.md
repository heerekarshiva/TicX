# Testing late-payment and refund paths (checklist section 3)

These cases are hard to reach through the UI (the payment window always ends before the reservation does), so force them in the database. Run on the sandbox project only.

## A. Paid after the reservation expired, ticket still free -> order succeeds
1. Buyer A clicks Buy and starts payment on Razorpay test mode (do NOT pay yet).
2. In Supabase SQL: `update ticket_listings set reservation_expires_at = now() - interval '1 minute' where id = '<listing>'; select release_expired_reservations();`
   Listing is ACTIVE again, A's order is CANCELLED.
3. Pay on the Razorpay checkout (or wait for the status poll). Expect: order PAID, listing SOLD, ticket in My Tickets, one seller_payouts row.

## B. Paid after expiry, ticket bought by B -> auto refund
Same as A, but between steps 2 and 3 buyer B clicks Buy (listing RESERVED by B). Then A pays.
Expect: A's order REFUNDED, payment_issues row ORDER_NOT_PAYABLE with REFUND_INITIATED, no payout for A.

## C. Failed refund is retried
1. Temporarily set a wrong RAZORPAY_KEY_SECRET (or block the refund call) and trigger case B.
2. Expect payment_issues.refund_status = REFUND_FAILED, refund_attempts = 1, last_error filled.
3. Restore the secret. Within ~2-3 minutes the cron retries and the status becomes REFUND_INITIATED. (Or click "Retry refund" in Admin > Payouts.)

## D. Payout never lost
In SQL, after a successful Razorpay order: `delete from seller_payouts where order_id = '<order>';` then open the order page (status poll). The payout row is recreated.

## E. Short reservation window
Pay when the reservation has under 5 minutes left (set reservation_expires_at to now()+3 min before clicking Pay). Expect the hold to extend (max 30 min total) and the Razorpay checkout to open, not a 502.
