import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimit } from '@/lib/rate-limit';
import { locationSchema, skipSchema, roundCoord } from '@/lib/geo/location';

export const dynamic = 'force-dynamic';

// Saved city for the signed-in user. Reads/writes only the caller's own profile row (id comes from the
// verified session, never from the request body).
export async function GET() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { data, error } = await supabase.from('profiles').select('country, state, city, location_permission').eq('id', user.id).maybeSingle();
  if (error) return NextResponse.json({ error: 'Could not load location.' }, { status: 500 });
  return NextResponse.json({
    country: data?.country ?? null, state: data?.state ?? null, city: data?.city ?? null, permission: data?.location_permission ?? 'unset'
  });
}

export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!checkRateLimit(`loc:${user.id}`, 20, 60_000)) return NextResponse.json({ error: 'Too many requests. Please wait a moment.' }, { status: 429 });

  const raw = await req.text();
  if (raw.length > 2000) return NextResponse.json({ error: 'Request too large.' }, { status: 413 });
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }); }

  const admin = createAdminClient();
  const now = new Date().toISOString();

  // "Skip for now": remember that we asked, so the user isn't redirected to onboarding on every login.
  if (skipSchema.safeParse(body).success) {
    const { error } = await admin.from('profiles').upsert({ id: user.id, email: user.email ?? null, location_permission: 'skipped', location_updated_at: now }, { onConflict: 'id' });
    if (error) return NextResponse.json({ error: 'Could not save.' }, { status: 500 });
    return NextResponse.json({ ok: true, permission: 'skipped' });
  }

  const parsed = locationSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Choose a valid city.' }, { status: 400 });
  const l = parsed.data;
  const granted = l.permission === 'granted' && l.latitude !== undefined && l.longitude !== undefined;

  const { error } = await admin.from('profiles').upsert({
    id: user.id,
    email: user.email ?? null,
    country: l.country,
    state: l.state || null,
    city: l.city,
    // Coordinates exist only if the browser permission was granted, and only at ~1 km precision.
    latitude: granted ? roundCoord(l.latitude!) : null,
    longitude: granted ? roundCoord(l.longitude!) : null,
    location_permission: granted ? 'granted' : l.permission === 'granted' ? 'denied' : l.permission,
    location_updated_at: now
  }, { onConflict: 'id' });
  if (error) { console.error('[location] save failed:', error.message); return NextResponse.json({ error: 'Could not save your city.' }, { status: 500 }); }
  return NextResponse.json({ ok: true, city: l.city, state: l.state || null, country: l.country });
}
