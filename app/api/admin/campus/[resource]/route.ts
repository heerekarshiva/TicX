import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/supabase/require-admin';
import { json, fail, shapeProducts, expireStalePromotions } from '@/lib/campus/server';
import { clean } from '@/lib/campus/schemas';

export const dynamic = 'force-dynamic';
type Ctx = { params: { resource: string } };
const uuid = z.string().uuid();
const txt = (max: number) => z.string().transform(clean).pipe(z.string().max(max));
const note = txt(300).optional();

// Every request re-verifies profiles.role = 'admin' server-side (lib/supabase/require-admin.ts). Admin identity is
// never taken from the request body. All mutations below are explicit, schema-validated actions.
async function gate() {
  const g = await requireAdmin();
  return g.error ? { res: fail(g.error, g.status) } : { admin: g.admin!, user: g.user! };
}
const body = async <T,>(req: NextRequest, schema: z.ZodSchema<T>) => {
  if (!(req.headers.get('content-type') ?? '').includes('application/json')) return { res: fail('Unsupported content type.', 415) };
  const raw = await req.text(); if (raw.length > 20_000) return { res: fail('Request too large.', 413) };
  let j: unknown; try { j = JSON.parse(raw); } catch { return { res: fail('Invalid request.') }; }
  const p = schema.safeParse(j); return p.success ? { data: p.data } : { res: fail(p.error.issues[0]?.message ?? 'Invalid input.') };
};

export async function GET(req: NextRequest, { params }: Ctx) {
  const g = await gate(); if ('res' in g) return g.res;
  const { admin } = g; const sp = req.nextUrl.searchParams;
  switch (params.resource) {
    case 'overview': {
      await expireStalePromotions(admin);
      const now = new Date().toISOString();
      const head = (t: string, f?: (q: any) => any) => { let q: any = admin.from(t).select('id', { count: 'exact', head: true }); if (f) q = f(q); return q.then((r: any) => r.count ?? 0); };
      const [active, pending, paused, sold, removed, openReports, promoEver, promoActive, promoPending, txCount, unverifiedTx] = await Promise.all([
        head('marketplace_products', q => q.eq('status', 'active')), head('marketplace_products', q => q.eq('status', 'pending')),
        head('marketplace_products', q => q.eq('status', 'paused')), head('marketplace_products', q => q.eq('status', 'sold')),
        head('marketplace_products', q => q.in('status', ['removed', 'rejected'])), head('marketplace_reports', q => q.eq('status', 'open')),
        head('marketplace_promotions', q => q.not('start_date', 'is', null)), head('marketplace_promotions', q => q.eq('status', 'active').gt('end_date', now)),
        head('marketplace_promotions', q => q.eq('status', 'pending')), head('marketplace_transactions'),
        head('marketplace_transactions', q => q.eq('verified', false))
      ]);
      // Revenue is computed from real rows only: paid promotions, and commission on VERIFIED transactions.
      const [{ data: paid }, { data: comm }] = await Promise.all([
        admin.from('marketplace_promotions').select('amount').eq('payment_status', 'paid'),
        admin.from('marketplace_transactions').select('commission_amount').eq('verified', true).not('commission_amount', 'is', null)
      ]);
      const sum = (rows: any[] | null, k: string) => Math.round((rows ?? []).reduce((s, r) => s + Number(r[k] ?? 0), 0) * 100) / 100;
      const { data: rate } = await admin.from('marketplace_settings').select('value').eq('key', 'commission_rate_percent').maybeSingle();
      return json({ listings: { active, pending, paused, sold, removed }, openReports,
        promotions: { everActivated: promoEver, active: promoActive, pending: promoPending, revenue: sum(paid, 'amount'), paidCount: paid?.length ?? 0 },
        transactions: { completed: txCount, unverified: unverifiedTx, commissionRevenue: sum(comm, 'commission_amount'), commissionRatePercent: Number(rate?.value ?? 0) } });
    }
    case 'products': {
      const status = sp.get('status'); const q = (sp.get('q') ?? '').replace(/[^\p{L}\p{N} -]/gu, ' ').trim().slice(0, 60);
      let qb = admin.from('marketplace_products').select('*').order('created_at', { ascending: false }).limit(60);
      if (status && ['pending', 'active', 'paused', 'sold', 'removed', 'rejected'].includes(status)) qb = qb.eq('status', status);
      if (q) qb = qb.ilike('title', `%${q}%`);
      const { data } = await qb; const items = await shapeProducts(admin, data ?? [], null);
      const meta = new Map((data ?? []).map(r => [r.id, { seller_id: r.seller_id, note: r.moderation_note }]));
      return json({ items: items.map((i: any) => ({ ...i, seller_id: meta.get(i.id)?.seller_id, moderation_note: meta.get(i.id)?.note })) });
    }
    case 'reports': {
      const status = sp.get('status') === 'all' ? null : sp.get('status') ?? 'open';
      let qb = admin.from('marketplace_reports').select('*').order('created_at', { ascending: false }).limit(80); if (status) qb = qb.eq('status', status);
      const { data } = await qb; const rows = data ?? [];
      const [{ data: prods }, { data: profs }] = await Promise.all([
        rows.length ? admin.from('marketplace_products').select('id, title, status, seller_id').in('id', rows.map(r => r.product_id)) : { data: [] as any[] },
        rows.length ? admin.from('profiles').select('id, full_name').in('id', Array.from(new Set(rows.map(r => r.reporter_id)))) : { data: [] as any[] }
      ]);
      const pm = new Map((prods ?? []).map((p: any) => [p.id, p])); const nm = new Map((profs ?? []).map((p: any) => [p.id, p.full_name]));
      return json({ items: rows.map(r => ({ ...r, product: pm.get(r.product_id) ?? null, reporter_name: nm.get(r.reporter_id) || 'Student' })) });
    }
    case 'sellers': {
      const filter = sp.get('filter') ?? 'unverified'; const q = (sp.get('q') ?? '').replace(/[^\p{L}\p{N}@. -]/gu, ' ').trim().slice(0, 60);
      let ids: string[] = [];
      if (q) { const { data } = await admin.from('profiles').select('id').or(`full_name.ilike.%${q}%,email.ilike.%${q}%`).limit(20); ids = (data ?? []).map(d => d.id); if (!ids.length) return json({ items: [] }); }
      let qb = admin.from('marketplace_student_profiles').select('*').order('updated_at', { ascending: false }).limit(60);
      if (ids.length) qb = qb.in('user_id', ids);
      else if (filter === 'unverified') qb = qb.eq('verified', false).not('college_name', 'is', null);
      else if (filter === 'verified') qb = qb.eq('verified', true);
      else if (filter === 'suspended') qb = qb.eq('suspended', true);
      const { data: sps } = await qb; const list = sps ?? [];
      const uids = list.map(s => s.user_id);
      const [{ data: profs }, { data: prods }] = await Promise.all([
        uids.length ? admin.from('profiles').select('id, full_name, email').in('id', uids) : { data: [] as any[] },
        uids.length ? admin.from('marketplace_products').select('seller_id, status').in('seller_id', uids) : { data: [] as any[] }
      ]);
      const pm = new Map((profs ?? []).map((p: any) => [p.id, p]));
      return json({ items: list.map(s => { const p: any = pm.get(s.user_id); const mine = (prods ?? []).filter((x: any) => x.seller_id === s.user_id);
        return { user_id: s.user_id, name: p?.full_name ?? 'Student', email: p?.email ?? null, college_name: s.college_name, college_city: s.college_city, verified: s.verified, suspended: s.suspended, suspended_reason: s.suspended_reason, listings: mine.length, active: mine.filter((x: any) => x.status === 'active').length }; }) });
    }
    case 'categories': { const { data } = await admin.from('marketplace_categories').select('*').order('sort_order').order('name'); return json({ items: data ?? [] }); }
    case 'plans': { const { data } = await admin.from('marketplace_promo_plans').select('*').order('duration_days'); return json({ items: (data ?? []).map(p => ({ ...p, price: Number(p.price) })) }); }
    case 'promotions': {
      await expireStalePromotions(admin);
      const status = sp.get('status'); let qb = admin.from('marketplace_promotions').select('*').order('created_at', { ascending: false }).limit(80);
      if (status && ['pending', 'active', 'expired', 'cancelled'].includes(status)) qb = qb.eq('status', status);
      const { data } = await qb; const rows = data ?? [];
      const { data: prods } = rows.length ? await admin.from('marketplace_products').select('id, title').in('id', rows.map(r => r.product_id)) : { data: [] as any[] };
      const tm = new Map((prods ?? []).map((p: any) => [p.id, p.title]));
      return json({ items: rows.map(r => ({ ...r, amount: Number(r.amount), product_title: tm.get(r.product_id) ?? '' })) });
    }
    case 'settings': {
      const { data } = await admin.from('marketplace_settings').select('key, value');
      return json({ settings: Object.fromEntries((data ?? []).map(s => [s.key, s.value])) });
    }
  }
  return fail('Unknown resource.', 404);
}

const productAction = z.object({ id: uuid, action: z.enum(['approve', 'reject', 'remove', 'restore']), note });
const reportAction = z.object({ id: uuid, action: z.enum(['uphold', 'dismiss']), removeListing: z.boolean().optional() });
const sellerAction = z.object({ userId: uuid, action: z.enum(['verify', 'unverify', 'suspend', 'unsuspend']), reason: note });
const promoAction = z.object({ id: uuid, action: z.enum(['mark_paid', 'waive', 'activate', 'cancel']), reference: txt(80).optional() });
const catPatch = z.object({ id: uuid, name: txt(60).optional(), description: txt(400).optional(), is_active: z.boolean().optional(), sort_order: z.number().int().min(0).max(999).optional() });
const planPatch = z.object({ id: uuid, name: txt(60).optional(), duration_days: z.number().int().min(1).max(90).optional(), price: z.number().min(0).max(100000).optional(), is_active: z.boolean().optional() });
const settingsPut = z.object({ require_moderation: z.boolean().optional(), commission_rate_percent: z.number().min(0).max(30).optional(), max_active_listings_per_user: z.number().int().min(1).max(500).optional() });

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const g = await gate(); if ('res' in g) return g.res;
  const { admin, user } = g; const now = new Date().toISOString();
  switch (params.resource) {
    case 'products': {
      const b = await body(req, productAction); if ('res' in b) return b.res; const { id, action, note: n } = b.data;
      const upd: Record<string, unknown> = { updated_at: now, moderation_note: n || null };
      if (action === 'approve' || action === 'restore') upd.status = 'active';
      else { upd.status = action === 'reject' ? 'rejected' : 'removed'; upd.is_featured = false; upd.featured_until = null; }
      const { error } = await admin.from('marketplace_products').update(upd).eq('id', id);
      if (error) return fail('Could not update the listing.', 500);
      if (upd.status === 'removed' || upd.status === 'rejected') await admin.from('marketplace_promotions').update({ status: 'cancelled' }).eq('product_id', id).in('status', ['pending', 'active']);
      return json({ ok: true });
    }
    case 'reports': {
      const b = await body(req, reportAction); if ('res' in b) return b.res;
      const { data: r } = await admin.from('marketplace_reports').select('id, product_id, status').eq('id', b.data.id).maybeSingle();
      if (!r) return fail('Report not found.', 404);
      const upheld = b.data.action === 'uphold';
      await admin.from('marketplace_reports').update({ status: upheld ? 'upheld' : 'dismissed', resolved_by: user.id, resolved_at: now }).eq('id', r.id);
      if (upheld && b.data.removeListing !== false) {
        await admin.from('marketplace_products').update({ status: 'removed', moderation_note: 'Removed after a report was upheld.', is_featured: false, featured_until: null, updated_at: now }).eq('id', r.product_id);
        await admin.from('marketplace_promotions').update({ status: 'cancelled' }).eq('product_id', r.product_id).in('status', ['pending', 'active']);
      }
      return json({ ok: true });
    }
    case 'sellers': {
      const b = await body(req, sellerAction); if ('res' in b) return b.res; const { userId, action, reason } = b.data;
      if (userId === user.id && action === 'suspend') return fail('You cannot suspend yourself.');
      const { data: prof } = await admin.from('profiles').select('id, role').eq('id', userId).maybeSingle();
      if (!prof) return fail('User not found.', 404);
      if (action === 'suspend' && prof.role === 'admin') return fail('Admins cannot be suspended here.', 403);
      const { data: sp } = await admin.from('marketplace_student_profiles').select('college_name').eq('user_id', userId).maybeSingle();
      if (action === 'verify' && !sp?.college_name) return fail('This student has not declared a college yet, so there is nothing to verify.', 409);
      const patch: Record<string, unknown> = { user_id: userId, updated_at: now };
      if (action === 'verify') Object.assign(patch, { verified: true, verified_at: now, verified_by: user.id });
      if (action === 'unverify') Object.assign(patch, { verified: false, verified_at: null, verified_by: null });
      if (action === 'suspend') Object.assign(patch, { suspended: true, suspended_reason: reason || null, suspended_at: now });
      if (action === 'unsuspend') Object.assign(patch, { suspended: false, suspended_reason: null, suspended_at: null });
      const { error } = await admin.from('marketplace_student_profiles').upsert(patch, { onConflict: 'user_id' });
      if (error) return fail('Could not update the seller.', 500);
      if (action === 'suspend') {   // hide their live listings; unsuspending does not auto-restore them
        await admin.from('marketplace_products').update({ status: 'paused', moderation_note: 'Seller suspended', updated_at: now }).eq('seller_id', userId).eq('status', 'active');
        await admin.from('marketplace_promotions').update({ status: 'cancelled' }).eq('seller_id', userId).in('status', ['pending', 'active']);
      }
      return json({ ok: true });
    }
    case 'promotions': {
      const b = await body(req, promoAction); if ('res' in b) return b.res;
      const { data: p } = await admin.from('marketplace_promotions').select('*').eq('id', b.data.id).maybeSingle();
      if (!p) return fail('Promotion not found.', 404);
      if (b.data.action === 'mark_paid' || b.data.action === 'waive') {
        if (p.status === 'cancelled' || p.status === 'expired') return fail('This promotion is closed.', 409);
        await admin.from('marketplace_promotions').update({ payment_status: b.data.action === 'waive' ? 'waived' : 'paid', payment_reference: b.data.reference || p.payment_reference }).eq('id', p.id);
        return json({ ok: true });
      }
      if (b.data.action === 'activate') {
        if (p.status !== 'pending') return fail('Only pending promotions can be activated.', 409);
        if (p.payment_status === 'unpaid') return fail('Confirm payment first (or waive the fee), then activate.', 409);
        const { data: prod } = await admin.from('marketplace_products').select('status').eq('id', p.product_id).maybeSingle();
        if (prod?.status !== 'active') return fail('The listing is not active, so it cannot be featured.', 409);
        const end = new Date(Date.now() + p.duration_days * 86_400_000).toISOString();
        await admin.from('marketplace_promotions').update({ status: 'active', start_date: now, end_date: end }).eq('id', p.id);
        await admin.from('marketplace_products').update({ is_featured: true, featured_until: end }).eq('id', p.product_id);
        return json({ ok: true, endsAt: end });
      }
      await admin.from('marketplace_promotions').update({ status: 'cancelled' }).eq('id', p.id);
      if (p.status === 'active') await admin.from('marketplace_products').update({ is_featured: false, featured_until: null }).eq('id', p.product_id);
      return json({ ok: true });
    }
    case 'categories': {
      const b = await body(req, catPatch); if ('res' in b) return b.res; const { id, ...rest } = b.data;
      const { error } = await admin.from('marketplace_categories').update(rest).eq('id', id);
      return error ? fail(error.code === '23505' ? 'A category with that name already exists.' : 'Could not update the category.', error.code === '23505' ? 409 : 500) : json({ ok: true });
    }
    case 'plans': {
      const b = await body(req, planPatch); if ('res' in b) return b.res; const { id, ...rest } = b.data;
      const { error } = await admin.from('marketplace_promo_plans').update(rest).eq('id', id);   // price is snapshotted on each promotion, so edits never change past requests
      return error ? fail('Could not update the plan.', 500) : json({ ok: true });
    }
  }
  return fail('Unknown resource.', 404);
}

const catCreate = z.object({ name: txt(60).pipe(z.string().min(2)), description: txt(400).optional(), sort_order: z.number().int().min(0).max(999).optional() });
const planCreate = z.object({ name: txt(60).pipe(z.string().min(2)), duration_days: z.number().int().min(1).max(90), price: z.number().min(0).max(100000) });

export async function POST(req: NextRequest, { params }: Ctx) {
  const g = await gate(); if ('res' in g) return g.res; const { admin } = g;
  if (params.resource === 'categories') {
    const b = await body(req, catCreate); if ('res' in b) return b.res;
    const slug = b.data.name.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
    if (slug.length < 2) return fail('Choose a different category name.');
    const { error } = await admin.from('marketplace_categories').insert({ name: b.data.name, slug, description: b.data.description || null, sort_order: b.data.sort_order ?? 100 });
    return error ? fail(error.code === '23505' ? 'A category with that name already exists.' : 'Could not create the category.', error.code === '23505' ? 409 : 500) : json({ ok: true }, 201);
  }
  if (params.resource === 'plans') {
    const b = await body(req, planCreate); if ('res' in b) return b.res;
    const { error } = await admin.from('marketplace_promo_plans').insert(b.data);
    return error ? fail('Could not create the plan.', 500) : json({ ok: true }, 201);
  }
  return fail('Unknown resource.', 404);
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  const g = await gate(); if ('res' in g) return g.res; const { admin } = g;
  if (params.resource !== 'settings') return fail('Unknown resource.', 404);
  const b = await body(req, settingsPut); if ('res' in b) return b.res;
  const rows = Object.entries(b.data).map(([key, value]) => ({ key, value, updated_at: new Date().toISOString() }));
  if (!rows.length) return fail('Nothing to update.');
  const { error } = await admin.from('marketplace_settings').upsert(rows, { onConflict: 'key' });
  return error ? fail('Could not save settings.', 500) : json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const g = await gate(); if ('res' in g) return g.res; const { admin } = g;
  if (params.resource !== 'categories') return fail('Unknown resource.', 404);
  const id = req.nextUrl.searchParams.get('id') ?? '';
  if (!uuid.safeParse(id).success) return fail('Invalid category.');
  const { count } = await admin.from('marketplace_products').select('id', { count: 'exact', head: true }).eq('category_id', id);
  if ((count ?? 0) > 0) return fail('This category has listings. Deactivate it instead of deleting.', 409);
  const { error } = await admin.from('marketplace_categories').delete().eq('id', id);
  return error ? fail('Could not delete the category.', 500) : json({ ok: true });
}
