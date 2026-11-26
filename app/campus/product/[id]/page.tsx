import type { Metadata } from 'next';
import ProductClient from './ProductClient';
import { createAdminClient } from '@/lib/supabase/admin';
import { pageMeta, NOINDEX } from '@/lib/seo';
import { imageUrl, inr } from '@/lib/campus/format';

export const dynamic = 'force-dynamic';

// Per-listing title/description/OG image so shared links look right. Only ACTIVE listings are described;
// anything else (sold/paused/removed/unknown) gets generic, noindex metadata and leaks nothing.
export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  try {
    if (!/^[0-9a-f-]{36}$/.test(params.id)) return { ...NOINDEX, title: 'Listing not found' };
    const { data } = await createAdminClient().from('marketplace_products').select('title, description, selling_price, college_name, city, images, status').eq('id', params.id).maybeSingle();
    if (!data || data.status !== 'active') return { ...NOINDEX, title: 'Campus Marketplace listing' };
    return pageMeta({
      title: `${data.title} – ${inr(data.selling_price)} | ${data.college_name}`,
      description: `${String(data.description).slice(0, 150)} · ${data.college_name}, ${data.city}`,
      path: `/campus/product/${params.id}`, image: data.images?.[0] ? imageUrl(data.images[0]) : null
    });
  } catch { return { ...NOINDEX, title: 'Campus Marketplace listing' }; }
}
export default function Page({ params }: { params: { id: string } }) { return <ProductClient id={params.id} />; }
