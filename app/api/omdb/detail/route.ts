import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getMovieDetail, OmdbError } from '@/lib/omdb';
import { checkRateLimit } from '@/lib/rate-limit';
import { clientIp } from '@/lib/client-ip';

const q = z.object({ id: z.string().regex(/^tt\d{5,10}$/, 'Invalid movie id') });

export async function GET(req: NextRequest) {
  if (!checkRateLimit(`omdb:${clientIp(req)}`, 60, 60_000)) return NextResponse.json({ error: 'Too many requests. Please slow down.' }, { status: 429 });
  const parsed = q.safeParse({ id: req.nextUrl.searchParams.get('id') ?? '' });
  if (!parsed.success) return NextResponse.json({ error: 'Invalid movie id.' }, { status: 400 });
  try {
    const movie = await getMovieDetail(parsed.data.id);
    return NextResponse.json({ movie }, { headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' } });
  } catch (e) {
    if (e instanceof OmdbError) {
      const status = e.code === 'RATE_LIMITED' ? 429 : e.code === 'NOT_FOUND' ? 404 : e.code === 'NOT_CONFIGURED' ? 503 : 502;
      return NextResponse.json({ error: e.message, code: e.code }, { status });
    }
    return NextResponse.json({ error: 'Movie service unavailable.' }, { status: 502 });
  }
}
