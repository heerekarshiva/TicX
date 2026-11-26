import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { PAGE_SIZE } from './constants';
import { shapeProducts } from './server';

export interface ListParams {
  q?: string; category?: string; college?: string; city?: string;
  min?: number; max?: number; condition?: string; sort?: string; page?: number; pageSize?: number;
  featuredOnly?: boolean; viewerId?: string | null;
}
const escapeLike = (s: string) => s.replace(/[\\%_]/g, m => '\\' + m);
// Letters, numbers, space, hyphen only: keeps user text safe inside a PostgREST or() filter.
const safeTerm = (s: string) => s.replace(/[^\p{L}\p{N} -]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);

/** Database-backed search (pg_trgm indexes on title/college) with filters, sorting and offset pagination. */
export async function listProducts(p: ListParams) {
  const admin = createAdminClient();
  const size = Math.min(p.pageSize ?? PAGE_SIZE, 48);
  const page = Math.min(Math.max(p.page ?? 1, 1), 100);
  let qb = admin.from('marketplace_products').select('*').eq('status', 'active');

  if (p.featuredOnly) qb = qb.gt('featured_until', new Date().toISOString());
  if (p.category) {
    const { data: c } = await admin.from('marketplace_categories').select('id').eq('slug', p.category).eq('is_active', true).maybeSingle();
    if (!c) return { items: [], page, hasMore: false };
    qb = qb.eq('category_id', c.id);
  }
  // Exact (case-insensitive) match: user text is LIKE-escaped, and these are bound parameters (not inside or()).
  if (p.college) qb = qb.ilike('college_name', escapeLike(p.college.slice(0, 160)));
  if (p.city) qb = qb.ilike('city', escapeLike(p.city.slice(0, 80)));
  if (p.min != null && Number.isFinite(p.min)) qb = qb.gte('selling_price', p.min);
  if (p.max != null && Number.isFinite(p.max)) qb = qb.lte('selling_price', p.max);
  if (p.condition && ['brand_new', 'like_new', 'good', 'acceptable'].includes(p.condition)) qb = qb.eq('condition', p.condition);

  const term = safeTerm(p.q ?? '');
  if (term) {
    const ors = [`title.ilike.%${term}%`, `college_name.ilike.%${term}%`, `city.ilike.%${term}%`];
    const [{ data: cats }, { data: sellers }] = await Promise.all([
      admin.from('marketplace_categories').select('id').ilike('name', `%${term}%`).limit(10),
      admin.from('profiles').select('id').ilike('full_name', `%${term}%`).limit(50)
    ]);
    if (cats?.length) ors.push(`category_id.in.(${cats.map(c => c.id).join(',')})`);
    if (sellers?.length) ors.push(`seller_id.in.(${sellers.map(s => s.id).join(',')})`);
    qb = qb.or(ors.join(','));
  }

  qb = p.sort === 'price_asc' ? qb.order('selling_price', { ascending: true }).order('created_at', { ascending: false })
    : p.sort === 'price_desc' ? qb.order('selling_price', { ascending: false }).order('created_at', { ascending: false })
    : qb.order('created_at', { ascending: false });

  const from = (page - 1) * size;
  const { data, error } = await qb.range(from, from + size); // size+1 rows => hasMore without a COUNT(*)
  if (error) throw error;
  const rows = data ?? [];
  const items = await shapeProducts(admin, rows.slice(0, size), p.viewerId ?? null);
  return { items, page, hasMore: rows.length > size };
}
