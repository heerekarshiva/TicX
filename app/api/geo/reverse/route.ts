import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { reverseGeoQuery, roundCoord } from '@/lib/geo/location';

export const dynamic = 'force-dynamic';

// Reverse geocoding (coordinates -> city) via OpenStreetMap Nominatim, called from the SERVER so the
// browser never talks to a third party and coordinates are not logged client-side. Signed-in users only,
// rate limited. Coordinates are rounded before leaving this server (city-level is all we need).
export async function GET(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!checkRateLimit(`geo:${user.id}`, 10, 60_000)) return NextResponse.json({ error: 'Too many requests. Please wait a moment.' }, { status: 429 });

  const parsed = reverseGeoQuery.safeParse({ lat: req.nextUrl.searchParams.get('lat'), lng: req.nextUrl.searchParams.get('lng') });
  if (!parsed.success) return NextResponse.json({ error: 'Invalid coordinates.' }, { status: 400 });
  const lat = roundCoord(parsed.data.lat), lng = roundCoord(parsed.data.lng);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&addressdetails=1&accept-language=en&lat=${lat}&lon=${lng}`;
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': `MyTICX/1.0 (${process.env.NEXT_PUBLIC_SUPPORT_EMAIL || 'support@myticx.app'})` },
      next: { revalidate: 86400 }
    });
    if (!res.ok) return NextResponse.json({ error: 'Could not detect your city. Please choose it manually.' }, { status: 502 });
    const j: any = await res.json();
    const a = j?.address ?? {};
    const city = a.city || a.town || a.municipality || a.city_district || a.village || a.county || a.state_district || null;
    if (!city || !a.country) return NextResponse.json({ error: 'Could not detect your city. Please choose it manually.' }, { status: 404 });
    return NextResponse.json({ country: String(a.country), state: a.state ? String(a.state) : '', city: String(city), latitude: lat, longitude: lng });
  } catch {
    return NextResponse.json({ error: 'Could not detect your city. Please choose it manually.' }, { status: 502 });
  } finally { clearTimeout(timer); }
}
