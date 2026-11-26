-- ============================================================================
-- TICX migration 0013: Campus Marketplace (students buy/sell college products).
-- ADDITIVE ONLY: creates new objects, never alters or drops existing ones.
-- Rollback: supabase/rollback/0013_campus_marketplace_down.sql
--
-- Security model (matches the rest of the app):
--   * Every WRITE goes through a Next.js route handler that verifies the session
--     (auth.getUser()) and then uses the service-role client. The user id is ALWAYS
--     derived from the session, never from the request body.
--   * RLS is enabled on every table. Clients get SELECT policies only (own rows /
--     public active listings). There are NO insert/update/delete policies and write
--     privileges are revoked, so the anon key alone cannot modify anything.
-- ============================================================================
create extension if not exists pg_trgm;

create table if not exists marketplace_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(name) between 2 and 60),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,60}$'),
  description text check (description is null or char_length(description) <= 400),
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
insert into marketplace_categories (name, slug, sort_order, description) values
  ('Books & Study Materials','books-study-materials',1,'Engineering textbooks, programming books, competitive exam books, previous semester books, lab manuals, handwritten notes, academic reference materials'),
  ('Electronics','electronics',2,'Scientific & engineering calculators, laptops, keyboards, computer accessories, headphones, electronic components'),
  ('College Essentials','college-essentials',3,'Lab coats, drawing instruments, record books, stationery, college bags, ID card holders'),
  ('Hostel Essentials','hostel-essentials',4,'Study tables, chairs, mattresses, pillows, buckets, storage boxes, lamps, other hostel accessories'),
  ('Other Products','other-products',5,'Sports equipment, bicycles, fashion accessories, general student products')
on conflict (slug) do nothing;

create table if not exists marketplace_colleges (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 160),
  city text not null check (char_length(city) between 2 and 80),
  state text check (state is null or char_length(state) <= 80),
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists uq_mkt_colleges_name_city on marketplace_colleges (lower(name), lower(city));
create index if not exists idx_mkt_colleges_name_trgm on marketplace_colleges using gin (name gin_trgm_ops);
insert into marketplace_colleges (name, city, state) values
  ('IIT Hyderabad','Sangareddy','Telangana'),('IIIT Hyderabad','Hyderabad','Telangana'),('Osmania University','Hyderabad','Telangana'),
  ('JNTU Hyderabad','Hyderabad','Telangana'),('BITS Pilani, Hyderabad Campus','Hyderabad','Telangana'),('University of Hyderabad','Hyderabad','Telangana'),
  ('NIT Warangal','Warangal','Telangana'),('IIT Bombay','Mumbai','Maharashtra'),('IIT Delhi','New Delhi','Delhi'),('IIT Madras','Chennai','Tamil Nadu'),
  ('IIT Kanpur','Kanpur','Uttar Pradesh'),('IIT Kharagpur','Kharagpur','West Bengal'),('NIT Trichy','Tiruchirappalli','Tamil Nadu'),
  ('NIT Surathkal','Mangaluru','Karnataka'),('BITS Pilani','Pilani','Rajasthan'),('Anna University','Chennai','Tamil Nadu'),
  ('Delhi Technological University','New Delhi','Delhi'),('VIT Vellore','Vellore','Tamil Nadu')
on conflict do nothing;

-- Declared college + admin-only VERIFIED / SUSPENDED flags. Kept out of `profiles` on purpose: this table has
-- no client write path, so users can never grant themselves "verified" or lift a suspension.
create table if not exists marketplace_student_profiles (
  user_id uuid primary key references profiles(id) on delete cascade,
  college_name text check (college_name is null or char_length(college_name) between 2 and 160),
  college_city text check (college_city is null or char_length(college_city) <= 80),
  college_state text check (college_state is null or char_length(college_state) <= 80),
  verified boolean not null default false,
  verified_at timestamptz,
  verified_by uuid references profiles(id) on delete set null,
  suspended boolean not null default false,
  suspended_reason text check (suspended_reason is null or char_length(suspended_reason) <= 300),
  suspended_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists marketplace_promo_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 60),
  duration_days int not null check (duration_days between 1 and 90),
  price numeric(10,2) not null check (price >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
-- Starter packages at price 0: the admin sets real prices (nothing is invented).
insert into marketplace_promo_plans (name, duration_days, price)
select v.name, v.d, 0 from (values ('3-day featured',3),('7-day featured',7),('15-day featured',15)) v(name,d)
where not exists (select 1 from marketplace_promo_plans);

create table if not exists marketplace_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
insert into marketplace_settings (key, value) values
  ('require_moderation','false'::jsonb),
  ('commission_rate_percent','0'::jsonb),
  ('max_active_listings_per_user','30'::jsonb)
on conflict (key) do nothing;

create table if not exists marketplace_products (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references profiles(id) on delete cascade,
  title text not null check (char_length(title) between 3 and 120),
  description text not null check (char_length(description) between 10 and 2000),
  category_id uuid not null references marketplace_categories(id),
  selling_price numeric(10,2) not null check (selling_price >= 0 and selling_price <= 10000000),
  original_price numeric(10,2) check (original_price is null or (original_price >= 0 and original_price <= 10000000)),
  condition text not null check (condition in ('brand_new','like_new','good','acceptable')),
  price_type text not null default 'negotiable' check (price_type in ('negotiable','fixed')),
  college_name text not null check (char_length(college_name) between 2 and 160),
  college_location text check (college_location is null or char_length(college_location) <= 160),
  city text not null check (char_length(city) between 2 and 80),
  state text check (state is null or char_length(state) <= 80),
  contact_method text not null default 'chat_and_offers' check (contact_method in ('chat_and_offers','chat_only','offers_only')),
  pickup_available boolean not null default true,
  meet_on_campus boolean not null default false,
  delivery_available boolean not null default false,
  images text[] not null check (array_length(images,1) between 1 and 5),
  status text not null default 'active' check (status in ('pending','active','paused','sold','removed','rejected')),
  moderation_note text check (moderation_note is null or char_length(moderation_note) <= 300),
  is_featured boolean not null default false,
  featured_until timestamptz,
  views_count int not null default 0,
  sold_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (original_price is null or original_price >= selling_price)
);
create index if not exists idx_mkt_products_status_created on marketplace_products (status, created_at desc);
create index if not exists idx_mkt_products_seller on marketplace_products (seller_id, status);
create index if not exists idx_mkt_products_category on marketplace_products (category_id, status);
create index if not exists idx_mkt_products_college on marketplace_products (lower(college_name), status);
create index if not exists idx_mkt_products_city on marketplace_products (lower(city), status);
create index if not exists idx_mkt_products_price on marketplace_products (status, selling_price);
create index if not exists idx_mkt_products_featured on marketplace_products (featured_until) where featured_until is not null;
create index if not exists idx_mkt_products_title_trgm on marketplace_products using gin (title gin_trgm_ops);
create index if not exists idx_mkt_products_college_trgm on marketplace_products using gin (college_name gin_trgm_ops);

create table if not exists marketplace_wishlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  product_id uuid not null references marketplace_products(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, product_id)
);
create index if not exists idx_mkt_wishlist_user on marketplace_wishlist (user_id, created_at desc);

create table if not exists marketplace_conversations (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references marketplace_products(id) on delete cascade,
  buyer_id uuid not null references profiles(id) on delete cascade,
  seller_id uuid not null references profiles(id) on delete cascade,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (product_id, buyer_id),
  check (buyer_id <> seller_id)
);
create index if not exists idx_mkt_conv_buyer on marketplace_conversations (buyer_id, last_message_at desc);
create index if not exists idx_mkt_conv_seller on marketplace_conversations (seller_id, last_message_at desc);

create table if not exists marketplace_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references marketplace_conversations(id) on delete cascade,
  sender_id uuid not null references profiles(id) on delete cascade,
  receiver_id uuid not null references profiles(id) on delete cascade,
  message text not null check (char_length(message) between 1 and 1000),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  check (sender_id <> receiver_id)
);
create index if not exists idx_mkt_msgs_conv on marketplace_messages (conversation_id, created_at);

create table if not exists marketplace_offers (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references marketplace_products(id) on delete cascade,
  buyer_id uuid not null references profiles(id) on delete cascade,
  seller_id uuid not null references profiles(id) on delete cascade,
  conversation_id uuid references marketplace_conversations(id) on delete set null,
  offered_price numeric(10,2) not null check (offered_price > 0 and offered_price <= 10000000),
  status text not null default 'pending' check (status in ('pending','accepted','rejected','withdrawn','completed','cancelled')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  completed_at timestamptz,
  check (buyer_id <> seller_id)
);
create index if not exists idx_mkt_offers_product on marketplace_offers (product_id, status);
create index if not exists idx_mkt_offers_buyer on marketplace_offers (buyer_id, created_at desc);
create index if not exists idx_mkt_offers_seller on marketplace_offers (seller_id, created_at desc);
-- One OPEN offer per buyer per product: spam control enforced by the database itself.
create unique index if not exists uq_mkt_offers_one_open on marketplace_offers (product_id, buyer_id) where status in ('pending','accepted');

-- Commission-ready, but NOT charged by default. `verified` stays false until a supported payment /
-- confirmation workflow flips it; commission is computed only for verified rows (lib/campus/commission.ts).
create table if not exists marketplace_transactions (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null unique references marketplace_offers(id) on delete restrict,
  product_id uuid not null references marketplace_products(id) on delete restrict,
  seller_id uuid not null references profiles(id) on delete restrict,
  buyer_id uuid not null references profiles(id) on delete restrict,
  amount numeric(10,2) not null check (amount > 0),
  confirmation_method text not null default 'seller_confirmed' check (confirmation_method in ('seller_confirmed','payment_gateway')),
  verified boolean not null default false,
  payment_reference text,
  commission_rate_percent numeric(5,2),
  commission_amount numeric(10,2),
  created_at timestamptz not null default now(),
  check (commission_amount is null or verified)
);
create index if not exists idx_mkt_tx_created on marketplace_transactions (created_at desc);

create table if not exists marketplace_reports (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references marketplace_products(id) on delete cascade,
  reporter_id uuid not null references profiles(id) on delete cascade,
  reason text not null check (reason in ('prohibited_item','scam_or_fraud','misleading','duplicate','inappropriate','other')),
  details text check (details is null or char_length(details) <= 500),
  status text not null default 'open' check (status in ('open','upheld','dismissed')),
  resolved_by uuid references profiles(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (product_id, reporter_id)
);
create index if not exists idx_mkt_reports_status on marketplace_reports (status, created_at desc);

-- Payment is MANUAL for now: seller requests -> admin confirms payment and activates.
create table if not exists marketplace_promotions (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references marketplace_products(id) on delete cascade,
  seller_id uuid not null references profiles(id) on delete cascade,
  plan_id uuid references marketplace_promo_plans(id) on delete set null,
  plan text not null,
  duration_days int not null check (duration_days > 0),
  amount numeric(10,2) not null check (amount >= 0),
  status text not null default 'pending' check (status in ('pending','active','expired','cancelled')),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid','paid','waived')),
  payment_reference text,
  start_date timestamptz,
  end_date timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_mkt_promos_status on marketplace_promotions (status, end_date);
create index if not exists idx_mkt_promos_seller on marketplace_promotions (seller_id, created_at desc);
create unique index if not exists uq_mkt_promos_one_open on marketplace_promotions (product_id) where status in ('pending','active');

-- Atomic: offer -> completed, product -> sold, competing offers -> cancelled, transaction row.
create or replace function marketplace_complete_offer(p_offer uuid, p_seller uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare o marketplace_offers%rowtype; tx uuid;
begin
  select * into o from marketplace_offers where id = p_offer for update;
  if not found or o.seller_id <> p_seller then raise exception 'OFFER_NOT_FOUND'; end if;
  if o.status <> 'accepted' then raise exception 'OFFER_NOT_ACCEPTED'; end if;
  perform 1 from marketplace_products where id = o.product_id and status in ('active','paused') for update;
  if not found then raise exception 'PRODUCT_NOT_AVAILABLE'; end if;
  update marketplace_offers set status = 'completed', completed_at = now() where id = o.id;
  update marketplace_offers set status = 'cancelled', responded_at = now()
    where product_id = o.product_id and id <> o.id and status in ('pending','accepted');
  update marketplace_products set status = 'sold', sold_at = now(), updated_at = now(), is_featured = false, featured_until = null where id = o.product_id;
  update marketplace_promotions set status = 'cancelled' where product_id = o.product_id and status in ('pending','active');
  insert into marketplace_transactions (offer_id, product_id, seller_id, buyer_id, amount)
    values (o.id, o.product_id, o.seller_id, o.buyer_id, o.offered_price) returning id into tx;
  return tx;
end $$;
revoke all on function marketplace_complete_offer(uuid, uuid) from public, anon, authenticated;

create or replace function marketplace_bump_views(p_product uuid) returns void
language sql security definer set search_path = public as $$
  update marketplace_products set views_count = views_count + 1 where id = p_product and status = 'active';
$$;
revoke all on function marketplace_bump_views(uuid) from public, anon, authenticated;

-- ---------- Row Level Security ----------
alter table marketplace_categories enable row level security;
alter table marketplace_colleges enable row level security;
alter table marketplace_student_profiles enable row level security;
alter table marketplace_promo_plans enable row level security;
alter table marketplace_settings enable row level security;
alter table marketplace_products enable row level security;
alter table marketplace_wishlist enable row level security;
alter table marketplace_conversations enable row level security;
alter table marketplace_messages enable row level security;
alter table marketplace_offers enable row level security;
alter table marketplace_transactions enable row level security;
alter table marketplace_reports enable row level security;
alter table marketplace_promotions enable row level security;

drop policy if exists mkt_categories_read on marketplace_categories;
create policy mkt_categories_read on marketplace_categories for select using (is_active);
drop policy if exists mkt_colleges_read on marketplace_colleges;
create policy mkt_colleges_read on marketplace_colleges for select using (true);
drop policy if exists mkt_student_read_own on marketplace_student_profiles;
create policy mkt_student_read_own on marketplace_student_profiles for select using (auth.uid() = user_id);
drop policy if exists mkt_plans_read on marketplace_promo_plans;
create policy mkt_plans_read on marketplace_promo_plans for select using (is_active);
-- marketplace_settings: no policies => unreadable by clients (server only).
drop policy if exists mkt_products_read on marketplace_products;
create policy mkt_products_read on marketplace_products for select using (status = 'active' or auth.uid() = seller_id);
drop policy if exists mkt_wishlist_read_own on marketplace_wishlist;
create policy mkt_wishlist_read_own on marketplace_wishlist for select using (auth.uid() = user_id);
drop policy if exists mkt_conv_read_parties on marketplace_conversations;
create policy mkt_conv_read_parties on marketplace_conversations for select using (auth.uid() in (buyer_id, seller_id));
drop policy if exists mkt_msgs_read_parties on marketplace_messages;
create policy mkt_msgs_read_parties on marketplace_messages for select using (auth.uid() in (sender_id, receiver_id));
drop policy if exists mkt_offers_read_parties on marketplace_offers;
create policy mkt_offers_read_parties on marketplace_offers for select using (auth.uid() in (buyer_id, seller_id));
drop policy if exists mkt_tx_read_parties on marketplace_transactions;
create policy mkt_tx_read_parties on marketplace_transactions for select using (auth.uid() in (buyer_id, seller_id));
drop policy if exists mkt_reports_read_own on marketplace_reports;
create policy mkt_reports_read_own on marketplace_reports for select using (auth.uid() = reporter_id);
drop policy if exists mkt_promos_read_own on marketplace_promotions;
create policy mkt_promos_read_own on marketplace_promotions for select using (auth.uid() = seller_id);

revoke insert, update, delete, truncate on
  marketplace_categories, marketplace_colleges, marketplace_student_profiles, marketplace_promo_plans,
  marketplace_settings, marketplace_products, marketplace_wishlist, marketplace_conversations,
  marketplace_messages, marketplace_offers, marketplace_transactions, marketplace_reports, marketplace_promotions
  from anon, authenticated;
revoke all on marketplace_settings from anon, authenticated;

-- ---------- Storage: product images (public READ; writes only via /api/campus/upload) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('campus-products', 'campus-products', true, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
