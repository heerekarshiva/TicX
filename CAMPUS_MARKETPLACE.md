# Campus Marketplace — delivery notes

A new, independent module for MyTICX where students buy and sell college products.
Lives at **`/campus`** (the existing ticket-resale page at `/marketplace` is untouched).

## 0. Read this first

| Topic | What you should know |
|---|---|
| **Security fix (migration 0014)** | `profiles_update_own` let any signed-in user change their own `role`, so anyone could make themselves admin from the browser. 0014 adds a trigger that blocks browser-originated changes to `role`, `fraud_state`, `phone_verified`. Server (service-role) code and the SQL editor are unaffected. It is separate and optional but **strongly recommended**: without it the admin dashboard is only as safe as that column. |
| **Auth** | Your brief mentions Clerk; the codebase uses **Supabase Auth**. The module uses Supabase Auth. No auth was added or replaced. |
| **Theme** | Orange (`brand-blue` token = `#FF7A00`) over the existing navy header; existing `Button/Card/Badge/Input/EmptyState` reused unchanged. |
| **Verified students** | `marketplace_student_profiles.verified` can only be set by an admin (Admin → Campus → Sellers). Declaring a college never grants a badge. Changing college resets verification. |
| **Payments** | None. No escrow, no buyer protection, and the UI says so. Accepting an offer does **not** mean payment happened. Promotions are confirmed manually by an admin. |
| **Commission** | Built but **off** (rate 0). Only computed for payment-verified transactions (also enforced by a DB check). Nothing is verifiable until a payment provider is wired in, so commission revenue shows ₹0. |

## 1. Files created
```
supabase/migrations/0013_campus_marketplace.sql          tables, indexes, RLS, functions, storage bucket, seed
supabase/migrations/0014_protect_profile_privileged_columns.sql
supabase/rollback/0013_campus_marketplace_down.sql
supabase/rollback/0014_protect_profile_privileged_columns_down.sql
lib/campus/{constants,format,schemas,spam,commission,payments,server,queries}.ts
components/campus/{ui.tsx,hooks.ts,ProductCard,CollegePicker,ImageUploader,Inbox}.tsx
app/campus/{layout,page,CampusHome}.tsx
app/campus/browse/{layout,page,BrowseClient}.tsx
app/campus/product/[id]/{page,ProductClient}.tsx
app/campus/sell/{layout,page,SellClient}.tsx
app/campus/dashboard/{layout,page,DashboardClient}.tsx
app/admin/campus/page.tsx
app/api/campus/{categories,colleges,me,products,products/[id],products/[id]/view,upload,
                wishlist,conversations,conversations/[id],offers,offers/[id],reports,promotions,dashboard}/route.ts
app/api/admin/campus/[resource]/route.ts
tests/campus-marketplace.test.ts
```

## 2. Files modified (4 existing files, one-line additive changes; verified by diff against your upload)
- `components/Navbar.tsx` — adds a "Campus Marketplace" link (desktop bar from `lg` up so the existing layout can't overflow; always in the mobile menu).
- `components/Footer.tsx` — adds a link in the Marketplace column.
- `components/events/AdminShell.tsx` — adds a "Campus" admin tab.
- `middleware.ts` — adds `/campus/sell` and `/campus/dashboard` to the protected prefixes/matcher.

Not modified: Browse Movies, Sell Tickets, Organize Events, existing tables, auth, branding, `/marketplace`, `/my-listings`, `/profile`, `/home`.
**Deliberate gap:** the brief asks for a Campus section "in the existing user dashboard". To honour "don't modify existing pages", the seller dashboard is its own page, `/campus/dashboard` (linked from the marketplace home). Adding a link card on `/home` or `/profile` is a one-line follow-up if you want it.

## 3. Database migrations (run in order in the Supabase SQL editor)
1. `0013_campus_marketplace.sql` — additive only. Creates 13 tables, indexes (incl. `pg_trgm` for search), RLS, 2 helper functions, seeds 5 categories, 18 real colleges, 3 starter promotion plans at **₹0** (set real prices in admin), and the `campus-products` bucket.
2. `0014_protect_profile_privileged_columns.sql` — recommended security fix (see §0).
Rollbacks are in `supabase/rollback/`.

Then make yourself admin if you aren't: `update profiles set role='admin' where id='<your auth user uuid>';`

## 4. Environment variables
**None new.** Uses the existing `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server only, never sent to the browser).

## 5. Supabase / storage configuration
- Migration 0013 creates bucket **`campus-products`**: public read, 2 MB limit, JPEG/PNG/WEBP only. There is intentionally **no** client write policy; uploads only go through `POST /api/campus/upload`.
- Requires `pg_trgm` (available on Supabase; the migration enables it).
- Existing rate limiter (`rate_limit_hit`, migration 0009) must already be applied — it is reused.

## 6. Security implementation
- **Identity** is always `auth.getUser()` on the server; no user/seller id in any request body is trusted. Ownership is enforced inside the SQL filter (`seller_id = session user`), not only beforehand.
- **RLS on every table**; clients get SELECT policies only; INSERT/UPDATE/DELETE privileges revoked from `anon`/`authenticated`; `marketplace_settings` unreadable by clients; helper functions callable by service role only.
- **Admin**: every admin API call re-checks `profiles.role='admin'` via your existing `requireAdmin()`; `/admin/*` is also gated by middleware.
- **Uploads**: auth + rate limit (40/h) + size cap + **magic-byte** type check (not client MIME) + server-generated paths namespaced by user id; create/edit only accept image paths under the caller's own folder. Client compresses to ≤1280 px WebP/JPEG (strips EXIF/GPS).
- **Input**: zod validation on every route, JSON-only content type (blocks cross-site form posts), size-capped bodies, HTML-tag stripping, LIKE-escaping, PostgREST filter-injection-safe search terms.
- **Privacy**: sellers appear as "First L."; no emails/phones in any public response; phone/email/WhatsApp patterns are rejected in public listing text; contact only via in-app chat.
- **Abuse**: per-user/IP rate limits on create, upload, messages, inquiries, offers, reports; one open offer per buyer per listing (DB unique index); lowball/over-ask offer limits; spam heuristics; listing cap per user; suspended sellers are blocked from all writes and their live listings paused.
- **Messages**: a conversation is only readable/writable by its buyer or seller; others get 404.

## 7. Testing — what was and was NOT verified
**Verified (automated, in this environment):**
- `tsc --noEmit`: 0 errors.
- `next build`: succeeds; all 21 new routes/pages compile.
- `vitest`: **73/73 pass** (24 new + 49 existing, unchanged).
- Migration SQL: parses as valid PostgreSQL (syntax only).
- Diff vs your upload: 4 files modified, 0 removed.

**NOT verified — I had no live Supabase or browser here:**
The migrations were not executed, and no end-to-end flow (login, create listing, upload, offers, admin actions, RLS behaviour) was run against a real database. Run this checklist on a **staging** project before production:

| Area | Check |
|---|---|
| Auth | `/campus/sell` and `/campus/dashboard` redirect to login when signed out; logout works |
| Selling | create with 1 and 5 photos; edit; pause/resume; mark sold; delete; 6th photo blocked |
| Uploads | `.gif`, a renamed `.exe`, and a >2 MB file are rejected |
| Buying | browse, search (product/category/college/city/seller), each filter + sort, Load more; wishlist; contact; offer |
| College | My College / Nearby / All / Select behave; verified badge absent until admin verifies |
| Security | user B can't edit/delete A's listing (404); can't read A's conversation; non-admin gets 403 on `/api/admin/campus/*`; signed-out calls get 401; with 0014 applied, `update profiles set role='admin'` from the browser console fails |
| Offers | accept ≠ sold; complete → listing sold, other offers cancelled, transaction row created `verified=false` |
| Admin | approve/reject/remove, uphold report, verify/suspend seller, category CRUD, plan prices, mark-paid → activate → listing appears in Featured, expiry |
| Existing | Browse Movies, Sell Tickets, Organize Events, navigation, login all still work |

## 8. Deployment
1. Staging first: apply 0013 (+0014) → set your admin → run §7 checklist.
2. Production: same migrations, then deploy the app (no new env vars). Nothing was deployed by me.
3. In Admin → Campus → Pricing set real prices for the 3 promotion plans; in Settings decide on moderation.

## 9. Known limitations / follow-ups
- No payment gateway: promotions are manual (request → admin marks paid → activates). `lib/campus/payments.ts` is the seam.
- Orphaned uploads (photos uploaded but never saved in a listing) aren't auto-cleaned; add a periodic cleanup if volume grows.
- Messaging polls every 15 s (no realtime) and has no email/push notifications.
- Search is trigram `ilike` — fast at current scale; move to full-text/ranking if listings reach very large numbers. No concurrent-user capacity is claimed; no load test was run.
- The seeded college list is small; colleges are added automatically as students use them.
- Public API responses are CDN-cached for 30 s, so a new listing can take up to ~30 s to appear in browse.
