import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimit } from '@/lib/rate-limit';
import { clientIp } from '@/lib/client-ip';
import { getDiscover } from '@/lib/discover';

export const dynamic = 'force-dynamic';

const q = z.object({
  city: z.string().trim().min(2).max(80).regex(/^[\p{L}\p{M} .'\-()]+$/u),
  when: z.enum(['any', 'today', 'tomorrow', 'weekend']).default('any'),
  maxPrice: z.coerce.number().min(0).max(100000).default(0),
  venue: z.string().trim().max(80).default(''),
  genre: z.string().trim().max(40).default('')
});

// Location-aware home data. Everything comes from the existing DB (listings view + events); nothing is invented.
// The public part is cached; the signed-in user's own registration status is layered on top, uncached.
export async function GET(req: NextRequest) {
  if (!checkRateLimit(`disc:${clientIp(req)}`, 60, 60_000)) return NextResponse.json({ error: 'Too many requests. Please slow down.' }, { status: 429 });
  const sp = req.nextUrl.searchParams;
  const parsed = q.safeParse({ city: sp.get('city') ?? '', when: sp.get('when') ?? undefined, maxPrice: sp.get('maxPrice') ?? undefined, venue: sp.get('venue') ?? undefined, genre: sp.get('genre') ?? undefined });
  if (!parsed.success) return NextResponse.json({ error: 'Choose a valid city.' }, { status: 400 });
  const f = parsed.data;
  try {
    const data = await getDiscover(f.city, f.when, f.maxPrice, f.venue, f.genre);
    let registrations: Record<string, string> = {};
    const ids = [...data.events, ...data.hackathons].map(e => e.id);
    if (ids.length) {
      const { data: { user } } = await createServerSupabaseClient().auth.getUser();
      if (user) {
        const { data: regs } = await createAdminClient().from('event_registrations').select('event_id, status').eq('user_id', user.id).in('event_id', ids);
        registrations = Object.fromEntries((regs ?? []).map((r: any) => [r.event_id, r.status]));
      }
    }
    return NextResponse.json({ ...data, registrations });
  } catch (e) {
    console.error('[discover] failed:', (e as Error).message);
    return NextResponse.json({ error: 'Could not load listings for your city.' }, { status: 500 });
  }
}
