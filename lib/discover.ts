import 'server-only';
import { unstable_cache } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { cityVariants, sameCity } from '@/lib/geo/cities';
import { dateRange, type When } from '@/lib/discover-dates';
import { getPublicEvents, type PublicEventSummary } from '@/lib/events/public';
import { effectiveStatus } from '@/lib/events/lifecycle';

export interface DiscoverFilters { city: string; when: When; maxPrice?: number; venue?: string; genre?: string }

export interface CityTicket {
  listing_id: string; resale_price: number; original_price: number; seat_label: string | null; verification_status: string;
  movie_id: string | null; movie_title: string | null; language: string | null; poster_url: string | null; genre: string | null;
  theatre_name: string | null; location: string | null; show_date: string | null; show_time: string | null; seller_phone_verified: boolean;
}
export interface CityMovie { movie_id: string; title: string; poster_url: string | null; language: string | null; genre: string | null; tickets: number }
export interface CityEvent {
  id: string; title: string; description: string | null; venue: string | null; city: string | null; start_at: string; poster_url: string | null;
  amount: number | null; registration_type: string; organizer_name: string | null; college_name: string | null;
  registration_closes_at: string | null; status: string; capacity: number | null;
}
export interface DiscoverData { city: string; movies: CityMovie[]; tickets: CityTicket[]; events: CityEvent[]; hackathons: CityEvent[]; venues: string[]; genres: string[] }

const clean = (v: string) => v.trim().replace(/[%_,()\\*]/g, ' ').slice(0, 80);
const HACKATHON = /hackathon|hack\s?fest|codeathon|ideathon/i;

export const isHackathon = (e: { event_type?: string | null; title?: string | null }) => HACKATHON.test(e.event_type ?? '') || HACKATHON.test(e.title ?? '');

async function loadTickets(f: DiscoverFilters): Promise<CityTicket[]> {
  const variants = cityVariants(f.city);
  if (!variants.length) return [];
  const { from, to } = dateRange(f.when);
  let q = createAdminClient()
    .from('marketplace_listings_view')
    .select('listing_id, resale_price, original_price, seat_label, verification_status, movie_id, movie_title, language, poster_url, theatre_name, location, show_date, show_time, seller_phone_verified')
    .eq('status', 'ACTIVE')
    .or(variants.map(v => `location.ilike.${clean(v)}`).join(','))
    .gte('show_date', from)
    .order('show_date', { ascending: true }).order('show_time', { ascending: true })
    .limit(60);
  if (to) q = q.lte('show_date', to);
  if (f.maxPrice && f.maxPrice > 0) q = q.lte('resale_price', f.maxPrice);
  if (f.venue) q = q.ilike('theatre_name', `%${clean(f.venue)}%`);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Omit<CityTicket, 'genre'>[];

  // movies.genre lives on the movies table (not in the marketplace view): look it up once for the ids we have.
  const ids = Array.from(new Set(rows.map(r => r.movie_id).filter(Boolean))) as string[];
  const genres = new Map<string, string | null>();
  if (ids.length) {
    const { data: ms } = await createAdminClient().from('movies').select('id, genre').in('id', ids);
    (ms ?? []).forEach((m: any) => genres.set(m.id, m.genre ?? null));
  }
  const withGenre = rows.map(r => ({ ...r, genre: r.movie_id ? genres.get(r.movie_id) ?? null : null }));
  const g = (f.genre ?? '').trim().toLowerCase();
  return g ? withGenre.filter(r => (r.genre ?? '').toLowerCase().includes(g)) : withGenre;
}

const toCityEvent = (e: PublicEventSummary): CityEvent => ({
  id: e.id, title: e.title, description: e.description, venue: e.venue, city: e.city, start_at: e.start_at, poster_url: e.poster_url,
  amount: e.amount, registration_type: e.registration_type, organizer_name: e.organizer_name, college_name: e.college_name,
  registration_closes_at: e.registration_closes_at, status: effectiveStatus(e as any), capacity: e.capacity
});

async function loadDiscover(f: DiscoverFilters): Promise<DiscoverData> {
  const [tickets, allEvents] = await Promise.all([loadTickets(f), getPublicEvents()]);
  const local = allEvents.filter(e => sameCity(f.city, e.city));
  const hackathons = local.filter(e => isHackathon(e)).map(toCityEvent).slice(0, 12);
  const events = local.filter(e => !isHackathon(e)).map(toCityEvent).slice(0, 12);

  const byMovie = new Map<string, CityMovie>();
  for (const t of tickets) {
    if (!t.movie_id || !t.movie_title) continue;
    const cur = byMovie.get(t.movie_id);
    if (cur) cur.tickets += 1;
    else byMovie.set(t.movie_id, { movie_id: t.movie_id, title: t.movie_title, poster_url: t.poster_url, language: t.language, genre: t.genre, tickets: 1 });
  }
  const venues = Array.from(new Set(tickets.map(t => t.theatre_name).filter(Boolean) as string[])).sort();
  const genres = Array.from(new Set(tickets.map(t => t.genre).filter(Boolean) as string[])).sort();
  return { city: f.city, movies: Array.from(byMovie.values()).slice(0, 12), tickets: tickets.slice(0, 24), events, hackathons, venues, genres };
}

// Public, user-independent data is cached briefly so a traffic spike reads the cache, not Postgres.
export const getDiscover = unstable_cache(
  (city: string, when: string, maxPrice: number, venue: string, genre: string) =>
    loadDiscover({ city, when: when as When, maxPrice: maxPrice || undefined, venue: venue || undefined, genre: genre || undefined }),
  ['discover-v1'],
  { revalidate: 30 }
);
