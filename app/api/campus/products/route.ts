import { NextRequest, NextResponse } from 'next/server';
import { listProducts } from '@/lib/campus/queries';
import { authed, json, fail, readBody, rateLimit, ipKey, getSetting, ensureCollege, PUBLIC_CACHE } from '@/lib/campus/server';
import { productInput } from '@/lib/campus/schemas';
import { publicTextHasContactInfo } from '@/lib/campus/spam';

export const dynamic = 'force-dynamic';
const num = (v: string | null) => (v !== null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : undefined);

// Public search/browse. Contains no per-user data, so responses are safely CDN-cacheable for a short time.
export async function GET(req: NextRequest) {
  const limited = await rateLimit(`browse:${ipKey(req)}`, 120, 60_000); if (limited) return limited;
  const sp = req.nextUrl.searchParams;
  try {
    const r = await listProducts({
      q: sp.get('q') ?? '', category: sp.get('category') ?? undefined, college: sp.get('college') ?? undefined, city: sp.get('city') ?? undefined,
      min: num(sp.get('min')), max: num(sp.get('max')), condition: sp.get('condition') ?? undefined, sort: sp.get('sort') ?? 'newest',
      page: num(sp.get('page')), pageSize: num(sp.get('pageSize')), featuredOnly: sp.get('featured') === '1'
    });
    return json(r, 200, PUBLIC_CACHE);
  } catch (e: any) { console.error('[campus] list failed:', e?.message); return fail('Could not load listings.', 500); }
}

const IMG_PATH = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp)$/;

export async function POST(req: NextRequest) {
  const a = await authed({ write: true }); if (a instanceof NextResponse) return a;
  const limited = await rateLimit(`create:${a.user.id}`, 10, 3_600_000, 'You are creating listings too quickly. Try again in a while.'); if (limited) return limited;
  const b = await readBody(req, productInput); if ('res' in b) return b.res;
  const d = b.data;

  // Seller id is the session user. Images must be files THIS user uploaded through /api/campus/upload.
  if (!d.images.every(p => IMG_PATH.test(p) && p.startsWith(`${a.user.id}/`))) return fail('One or more photos are invalid. Please re-upload them.');
  if (publicTextHasContactInfo(d.title, d.description)) return fail('Please remove phone numbers, emails and messaging handles from the listing. Buyers can reach you through in-app chat.');

  const { data: cat } = await a.admin.from('marketplace_categories').select('id').eq('id', d.categoryId).eq('is_active', true).maybeSingle();
  if (!cat) return fail('Choose a valid category.');

  const cap = await getSetting<number>(a.admin, 'max_active_listings_per_user', 30);
  const { count } = await a.admin.from('marketplace_products').select('id', { count: 'exact', head: true }).eq('seller_id', a.user.id).in('status', ['active', 'pending', 'paused']);
  if ((count ?? 0) >= cap) return fail(`You can have up to ${cap} live listings. Mark some as sold or delete them first.`, 409);

  const moderate = await getSetting<boolean>(a.admin, 'require_moderation', false);
  const { data, error } = await a.admin.from('marketplace_products').insert({
    seller_id: a.user.id, title: d.title, description: d.description, category_id: d.categoryId,
    selling_price: d.sellingPrice, original_price: d.originalPrice ?? null, condition: d.condition, price_type: d.priceType,
    college_name: d.collegeName, college_location: d.collegeLocation ?? null, city: d.city, state: d.state ?? null,
    contact_method: d.contactMethod, pickup_available: d.pickupAvailable, meet_on_campus: d.meetOnCampus, delivery_available: d.deliveryAvailable,
    images: d.images, status: moderate ? 'pending' : 'active'
  }).select('id, status').single();
  if (error || !data) { console.error('[campus] create failed:', error?.message); return fail('Could not save your listing. Please try again.', 500); }
  await ensureCollege(a.admin, a.user.id, d.collegeName, d.city, d.state);
  return json({ id: data.id, status: data.status }, 201);
}
