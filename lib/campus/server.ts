import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import type { ZodSchema } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimitShared } from '@/lib/rate-limit';
import { clientIp } from '@/lib/client-ip';
import { imageUrl, shortName } from './format';

export const json = (data: unknown, status = 200, headers?: Record<string, string>) => NextResponse.json(data, { status, headers });
export const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });
export const PUBLIC_CACHE = { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120' };

export type Admin = ReturnType<typeof createAdminClient>;
export interface Authed { user: { id: string; email?: string | null }; admin: Admin; suspended: boolean }

/**
 * Identity ALWAYS comes from the verified session (auth.getUser validates the JWT with Supabase Auth).
 * Nothing in a request body is ever trusted as a user/seller id.
 * { write: true } additionally refuses suspended sellers.
 */
export async function authed(opts: { write?: boolean } = {}): Promise<Authed | NextResponse> {
  const { data: { user } } = await createServerSupabaseClient().auth.getUser();
  if (!user) return fail('Please sign in to continue.', 401);
  const admin = createAdminClient();
  const { data: sp } = await admin.from('marketplace_student_profiles').select('suspended').eq('user_id', user.id).maybeSingle();
  if (opts.write && sp?.suspended) return fail('Your Campus Marketplace access is suspended. Contact support if you think this is a mistake.', 403);
  return { user: { id: user.id, email: user.email }, admin, suspended: !!sp?.suspended };
}
export async function optionalUserId(): Promise<string | null> {
  try { return (await createServerSupabaseClient().auth.getUser()).data.user?.id ?? null; } catch { return null; }
}

export async function rateLimit(key: string, limit: number, windowMs: number, msg = 'Too many requests. Please slow down and try again shortly.') {
  return (await checkRateLimitShared(`campus:${key}`, limit, windowMs)) ? null : fail(msg, 429);
}
export const ipKey = (req: NextRequest) => clientIp(req);

/** Reads a size-capped JSON body and validates it. Requires application/json (blocks cross-site form posts). */
export async function readBody<T>(req: NextRequest, schema: ZodSchema<T>, maxBytes = 20_000): Promise<{ data: T } | { res: NextResponse }> {
  if (!(req.headers.get('content-type') ?? '').includes('application/json')) return { res: fail('Unsupported content type.', 415) };
  const raw = await req.text();
  if (raw.length > maxBytes) return { res: fail('Request too large.', 413) };
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return { res: fail('Invalid request.', 400) }; }
  const p = schema.safeParse(body);
  if (!p.success) return { res: fail(p.error.issues[0]?.message ?? 'Invalid input.', 400) };
  return { data: p.data };
}

export async function getSetting<T>(admin: Admin, key: string, fallback: T): Promise<T> {
  const { data } = await admin.from('marketplace_settings').select('value').eq('key', key).maybeSingle();
  return (data?.value as T) ?? fallback;
}

// ---------- public shaping (never leaks seller ids, emails or phones) ----------
export async function shapeProducts(admin: Admin, rows: any[], viewerId: string | null, detail = false): Promise<any[]> {
  if (rows.length === 0) return [];
  const sellerIds = Array.from(new Set(rows.map(r => r.seller_id)));
  const catIds = Array.from(new Set(rows.map(r => r.category_id)));
  const [{ data: profs }, { data: sps }, { data: cats }] = await Promise.all([
    admin.from('profiles').select('id, full_name, created_at').in('id', sellerIds),
    admin.from('marketplace_student_profiles').select('user_id, verified, college_name').in('user_id', sellerIds),
    admin.from('marketplace_categories').select('id, name, slug').in('id', catIds)
  ]);
  const pm = new Map((profs ?? []).map((p: any) => [p.id, p]));
  const sm = new Map((sps ?? []).map((p: any) => [p.user_id, p]));
  const cm = new Map((cats ?? []).map((c: any) => [c.id, c]));
  const now = Date.now();
  return rows.map(r => {
    const p: any = pm.get(r.seller_id); const s: any = sm.get(r.seller_id);
    const base: any = {
      id: r.id, title: r.title, selling_price: Number(r.selling_price), original_price: r.original_price == null ? null : Number(r.original_price),
      condition: r.condition, price_type: r.price_type, college_name: r.college_name, city: r.city, state: r.state,
      images: (r.images as string[]).map(imageUrl), status: r.status, created_at: r.created_at,
      featured: !!r.featured_until && new Date(r.featured_until).getTime() > now && r.status === 'active',
      category: cm.get(r.category_id) ?? null,
      seller: { name: shortName(p?.full_name), verified: !!s?.verified },   // "verified" ONLY if an admin verified them
      is_owner: viewerId === r.seller_id
    };
    if (detail) Object.assign(base, {
      description: r.description, college_location: r.college_location, contact_method: r.contact_method,
      pickup_available: r.pickup_available, meet_on_campus: r.meet_on_campus, delivery_available: r.delivery_available,
      views_count: r.views_count, seller_member_since: p?.created_at ?? null, seller_college: s?.verified ? s.college_name : null
    });
    return base;
  });
}

const esc = (v: string) => v.replace(/[\\%_]/g, m => '\\' + m);
/** Adds a college to the searchable list the first time anyone uses it. Does NOT imply the user belongs to it. */
export async function ensureCollege(admin: Admin, userId: string, name: string, city: string, state?: string | null) {
  const { data } = await admin.from('marketplace_colleges').select('id').ilike('name', esc(name)).ilike('city', esc(city)).limit(1);
  if (data && data.length) return;
  // The unique index on (lower(name), lower(city)) makes a concurrent duplicate insert fail harmlessly.
  await admin.from('marketplace_colleges').insert({ name, city, state: state ?? null, created_by: userId });
}

/** Lazy expiry (no cron needed): promotions past end_date become 'expired'; listing flags are cleared. */
export async function expireStalePromotions(admin: Admin) {
  const now = new Date().toISOString();
  const { data } = await admin.from('marketplace_promotions').update({ status: 'expired' }).eq('status', 'active').lt('end_date', now).select('product_id');
  const ids = (data ?? []).map((d: any) => d.product_id);
  if (ids.length) await admin.from('marketplace_products').update({ is_featured: false }).in('id', ids).lt('featured_until', now);
}
