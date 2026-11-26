import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { lazySync, getSettings } from '@/lib/events/server';
import { isDiscoverable } from '@/lib/events/lifecycle';

// Public discovery. Only events that are still accepting (or about to accept)
// registrations are listed, and the status is re-derived from the clock here —
// so an event vanishes at start-30min even if the cron has not run. No
// participant data, organizer email or payment details are exposed.
<<<<<<< HEAD
=======
export const dynamic = 'force-dynamic';

>>>>>>> 952ded43d45a4b3be5481656a06799a8854925de
export async function GET() {
  await lazySync();
  const admin = createAdminClient();
  const { data, error } = await admin.from('events')
    .select('id, event_type, event_type_id, title, description, venue, city, college_name, organizer_name, event_date, event_time, start_at, end_at, registration_closes_at, registration_opens_at, registration_type, amount, poster_url, capacity, status')
    .in('status', ['PUBLISHED', 'REGISTRATION_OPEN']).gt('start_at', new Date().toISOString()).order('start_at', { ascending: true });
  if (error) return NextResponse.json({ error: 'Could not load events.' }, { status: 500 });
  const settings = await getSettings();
  return NextResponse.json({ timezone: settings.timezone, events: (data ?? []).filter(e => isDiscoverable(e as any)) });
}
