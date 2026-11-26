import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { authed, optionalUserId, json, fail, readBody, rateLimit, getSetting, shapeProducts, ensureCollege } from '@/lib/campus/server';
import { productPatch } from '@/lib/campus/schemas';
import { publicTextHasContactInfo } from '@/lib/campus/spam';
import { BUCKET } from '@/lib/campus/constants';

export const dynamic = 'force-dynamic';
const uuid = z.string().uuid();
const IMG_PATH = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp)$/;

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!uuid.safeParse(params.id).success) return fail('Listing not found.', 404);
  const admin = createAdminClient();
  const viewer = await optionalUserId();
  const { data: row } = await admin.from('marketplace_products').select('*').eq('id', params.id).maybeSingle();
  // Non-active listings are visible to their owner only; everyone else gets a 404 (no existence leak).
  if (!row || (row.status !== 'active' && row.seller_id !== viewer)) return fail('This listing is no longer available.', 404);
  const [item] = await shapeProducts(admin, [row], viewer, true);
  if (viewer === row.seller_id) item.image_paths = row.images;   // owner-only: needed to edit a listing
  let viewerState: any = null;
  if (viewer && row.seller_id !== viewer) {
    const [{ data: w }, { data: o }, { data: c }] = await Promise.all([
      admin.from('marketplace_wishlist').select('id').eq('user_id', viewer).eq('product_id', row.id).maybeSingle(),
      admin.from('marketplace_offers').select('id, offered_price, status').eq('product_id', row.id).eq('buyer_id', viewer).in('status', ['pending', 'accepted']).maybeSingle(),
      admin.from('marketplace_conversations').select('id').eq('product_id', row.id).eq('buyer_id', viewer).maybeSingle()
    ]);
    viewerState = { wishlisted: !!w, openOffer: o ?? null, conversationId: c?.id ?? null };
  }
  const { count } = await admin.from('marketplace_products').select('id', { count: 'exact', head: true }).eq('seller_id', row.seller_id).eq('status', 'active');
  return json({ product: { ...item, seller: { ...item.seller, active_listings: count ?? 0 } }, viewer: viewerState, signedIn: !!viewer });
}

async function removeFiles(admin: ReturnType<typeof createAdminClient>, paths: string[]) {
  if (paths.length) await admin.storage.from(BUCKET).remove(paths).catch(() => {});
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!uuid.safeParse(params.id).success) return fail('Listing not found.', 404);
  const a = await authed({ write: true }); if (a instanceof NextResponse) return a;
  const limited = await rateLimit(`edit:${a.user.id}`, 60, 3_600_000); if (limited) return limited;
  const b = await readBody(req, productPatch); if ('res' in b) return b.res;

  // Ownership is enforced IN the query (seller_id = session user), not just checked beforehand.
  const { data: cur } = await a.admin.from('marketplace_products').select('id, status, images').eq('id', params.id).eq('seller_id', a.user.id).maybeSingle();
  if (!cur) return fail('Listing not found.', 404);
  if (['removed', 'rejected'].includes(cur.status)) return fail('This listing was removed by a moderator and cannot be changed.', 403);
  const now = new Date().toISOString();
  const { action, data: d } = b.data;

  if (action === 'pause') {
    if (cur.status !== 'active') return fail('Only active listings can be paused.', 409);
    await a.admin.from('marketplace_products').update({ status: 'paused', updated_at: now }).eq('id', cur.id).eq('seller_id', a.user.id);
    return json({ status: 'paused' });
  }
  if (action === 'activate') {
    if (cur.status !== 'paused') return fail('Only paused listings can be re-activated.', 409);
    const moderate = await getSetting<boolean>(a.admin, 'require_moderation', false);
    const status = moderate ? 'pending' : 'active';
    await a.admin.from('marketplace_products').update({ status, updated_at: now }).eq('id', cur.id).eq('seller_id', a.user.id);
    return json({ status });
  }
  if (action === 'sold') {
    if (!['active', 'paused'].includes(cur.status)) return fail('This listing cannot be marked as sold.', 409);
    await a.admin.from('marketplace_products').update({ status: 'sold', sold_at: now, updated_at: now, is_featured: false, featured_until: null }).eq('id', cur.id).eq('seller_id', a.user.id);
    await a.admin.from('marketplace_promotions').update({ status: 'cancelled' }).eq('product_id', cur.id).in('status', ['pending', 'active']);
    await a.admin.from('marketplace_offers').update({ status: 'cancelled', responded_at: now }).eq('product_id', cur.id).in('status', ['pending', 'accepted']);
    return json({ status: 'sold' });
  }
  // edit
  if (!d) return fail('Missing listing details.');
  if (cur.status === 'sold') return fail('Sold listings cannot be edited.', 409);
  if (!d.images.every(p => IMG_PATH.test(p) && p.startsWith(`${a.user.id}/`))) return fail('One or more photos are invalid. Please re-upload them.');
  if (publicTextHasContactInfo(d.title, d.description)) return fail('Please remove phone numbers, emails and messaging handles from the listing.');
  const { data: cat } = await a.admin.from('marketplace_categories').select('id').eq('id', d.categoryId).eq('is_active', true).maybeSingle();
  if (!cat) return fail('Choose a valid category.');
  const moderate = await getSetting<boolean>(a.admin, 'require_moderation', false);
  const { error } = await a.admin.from('marketplace_products').update({
    title: d.title, description: d.description, category_id: d.categoryId, selling_price: d.sellingPrice, original_price: d.originalPrice ?? null,
    condition: d.condition, price_type: d.priceType, college_name: d.collegeName, college_location: d.collegeLocation ?? null, city: d.city, state: d.state ?? null,
    contact_method: d.contactMethod, pickup_available: d.pickupAvailable, meet_on_campus: d.meetOnCampus, delivery_available: d.deliveryAvailable,
    images: d.images, updated_at: now, ...(moderate && cur.status === 'active' ? { status: 'pending' } : {})
  }).eq('id', cur.id).eq('seller_id', a.user.id);
  if (error) return fail('Could not save changes.', 500);
  await removeFiles(a.admin, (cur.images as string[]).filter(p => !d.images.includes(p)));
  await ensureCollege(a.admin, a.user.id, d.collegeName, d.city, d.state);
  return json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!uuid.safeParse(params.id).success) return fail('Listing not found.', 404);
  const a = await authed({ write: true }); if (a instanceof NextResponse) return a;
  const limited = await rateLimit(`del:${a.user.id}`, 60, 3_600_000); if (limited) return limited;
  const { data: cur } = await a.admin.from('marketplace_products').select('id, images').eq('id', params.id).eq('seller_id', a.user.id).maybeSingle();
  if (!cur) return fail('Listing not found.', 404);
  const { error } = await a.admin.from('marketplace_products').delete().eq('id', cur.id).eq('seller_id', a.user.id);
  // marketplace_transactions uses ON DELETE RESTRICT: a listing with a completed sale keeps its record.
  if (error) return fail('This listing has a completed sale, so it is kept for records. It is already hidden from buyers.', 409);
  await removeFiles(a.admin, cur.images as string[]);
  return json({ ok: true });
}
