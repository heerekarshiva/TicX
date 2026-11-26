import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { searchMovies, OmdbError } from '@/lib/omdb';
import { checkRateLimit } from '@/lib/rate-limit';
import { clientIp } from '@/lib/client-ip';

const q = z.object({
  q: z.string().trim().min(2, 'Type at least 2 characters').max(80),
  year: z.string().regex(/^(19|20)\d{2}$/).optional(),
  type: z.enum(['movie', 'series', 'episode']).optional(),
  page: z.coerce.number().int().min(1).max(100).default(1)
});

export async function GET(req: NextRequest) {
  if (!checkRateLimit(`omdb:${clientIp(req)}`, 60, 60_000)) return NextResponse.json({ error: 'Too many requests. Please slow down.' }, { status: 429 });
  const sp = req.nextUrl.searchParams;
  const parsed = q.safeParse({ q: sp.get('q') ?? '', year: sp.get('year') || undefined, type: sp.get('type') || undefined, page: sp.get('page') ?? 1 });
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid search.' }, { status: 400 });
  try {
    const r = await searchMovies(parsed.data);
    return NextResponse.json(r, { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } });
  } catch (e) {
    if (e instanceof OmdbError) {
      const status = e.code === 'RATE_LIMITED' ? 429 : e.code === 'NOT_CONFIGURED' ? 503 : 502;
      return NextResponse.json({ error: e.message, code: e.code }, { status });
    }
    return NextResponse.json({ error: 'Movie service unavailable.' }, { status: 502 });
  }
}
