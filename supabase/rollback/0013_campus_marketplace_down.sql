-- Rolls back 0013. Destroys all Campus Marketplace data. Existing MyTICX tables are untouched.
drop function if exists marketplace_complete_offer(uuid, uuid);
drop function if exists marketplace_bump_views(uuid);
drop table if exists marketplace_transactions, marketplace_promotions, marketplace_reports, marketplace_messages,
  marketplace_offers, marketplace_conversations, marketplace_wishlist, marketplace_products,
  marketplace_settings, marketplace_promo_plans, marketplace_student_profiles, marketplace_colleges, marketplace_categories cascade;
-- Bucket: empty it in Dashboard -> Storage, then: delete from storage.buckets where id = 'campus-products';
