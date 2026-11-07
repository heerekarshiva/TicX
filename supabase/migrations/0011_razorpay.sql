-- MyTICX migration 0011: Razorpay. Safe to re-run.
-- Seller payouts are created inside the same transaction that marks an order PAID, for every gateway-collected
-- payment (Razorpay now; 'phonepe' kept so older paid orders still reconcile). Run this BEFORE going live on Razorpay,
-- otherwise paid orders would be marked PAID without a seller payout row.
create or replace function finalize_paid_order(p_order_id uuid) returns void
language plpgsql as $$
declare
  v_order orders%rowtype;
  v_listing ticket_listings%rowtype;
begin
  select * into v_order from orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.status in ('PAID','TRANSFERRED') then return; end if;

  select * into v_listing from ticket_listings where id = v_order.listing_id for update;

  if v_order.status = 'CANCELLED' then
    if v_listing.status <> 'ACTIVE' then raise exception 'ORDER_NOT_PAYABLE'; end if;
    if exists (select 1 from orders o where o.listing_id = v_order.listing_id and o.id <> v_order.id
               and o.status in ('CREATED','PAYMENT_PENDING','PAID','TRANSFERRED')) then
      raise exception 'ORDER_NOT_PAYABLE';
    end if;
  elsif v_order.status <> 'PAYMENT_PENDING' then
    raise exception 'ORDER_NOT_PAYABLE';
  end if;

  update orders set status = 'PAID', updated_at = now() where id = p_order_id;
  update ticket_listings set status = 'SOLD', sold_at = now(), reserved_by = null, reservation_expires_at = null, updated_at = now() where id = v_order.listing_id;
  update tickets set status = 'SOLD', updated_at = now() where id = v_listing.ticket_id;

  insert into ticket_transfers (order_id, ticket_id, from_user_id, to_user_id, status)
  values (v_order.id, v_listing.ticket_id, v_order.seller_id, v_order.buyer_id, 'PENDING');

  insert into notifications (user_id, type, title, body) values
    (v_order.buyer_id, 'PAYMENT_COMPLETED', 'Payment successful', 'Your ticket purchase is confirmed.'),
    (v_order.seller_id, 'TICKET_SOLD', 'Your ticket sold', 'Your listed ticket has been purchased.');

  if exists (select 1 from payments where order_id = p_order_id and provider in ('phonepe', 'razorpay') and status = 'SUCCEEDED') then
    insert into seller_payouts (order_id, seller_id, amount)
    values (v_order.id, v_order.seller_id, v_order.ticket_price)
    on conflict (order_id) do nothing;
  end if;
end $$;


-- Backfill: any gateway-paid order that is missing its payout row.
insert into seller_payouts (order_id, seller_id, amount)
select o.id, o.seller_id, o.ticket_price
from orders o
where o.status in ('PAID','TRANSFERRED')
  and exists (select 1 from payments p where p.order_id = o.id and p.provider in ('phonepe', 'razorpay') and p.status = 'SUCCEEDED')
  and not exists (select 1 from seller_payouts sp where sp.order_id = o.id)
on conflict (order_id) do nothing;
