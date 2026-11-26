'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MapPin, Calendar, Ticket, Film, Code2, ShieldCheck } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { LocationPicker } from '@/components/LocationPicker';
import { formatTime12h } from '@/lib/utils';

type When = 'any' | 'today' | 'tomorrow' | 'weekend';
interface Ticket { listing_id: string; resale_price: number; seat_label: string | null; verification_status: string; movie_title: string | null; language: string | null; poster_url: string | null; genre: string | null; theatre_name: string | null; show_date: string | null; show_time: string | null; seller_phone_verified: boolean }
interface Movie { movie_id: string; title: string; poster_url: string | null; language: string | null; tickets: number }
interface Ev { id: string; title: string; description: string | null; venue: string | null; city: string | null; start_at: string; poster_url: string | null; amount: number | null; registration_type: string; organizer_name: string | null; college_name: string | null; registration_closes_at: string | null; status: string }
interface Data { city: string; movies: Movie[]; tickets: Ticket[]; events: Ev[]; hackathons: Ev[]; venues: string[]; genres: string[]; registrations: Record<string, string> }

const WHEN: { id: When; label: string }[] = [{ id: 'any', label: 'All dates' }, { id: 'today', label: 'Today' }, { id: 'tomorrow', label: 'Tomorrow' }, { id: 'weekend', label: 'This weekend' }];
const PRICES = [{ v: 0, l: 'Any price' }, { v: 150, l: 'Up to ₹150' }, { v: 250, l: 'Up to ₹250' }, { v: 400, l: 'Up to ₹400' }, { v: 600, l: 'Up to ₹600' }];
const REG_LABEL: Record<string, string> = { PENDING_PAYMENT: 'Payment pending', SUBMITTED: 'Payment submitted', CONFIRMED: 'Registered', REJECTED: 'Rejected', CANCELLED: 'Cancelled' };
const STATUS_LABEL: Record<string, string> = { REGISTRATION_OPEN: 'Registration open', PUBLISHED: 'Opens soon', REGISTRATION_CLOSED: 'Registration closed', ONGOING: 'Ongoing' };
const selCls = 'h-9 rounded-full border border-slate-200 bg-white px-3 text-xs text-navy-900 focus:outline-none focus:ring-2 focus:ring-brand-blue';

const fmtDate = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });

export function LocationDiscovery() {
  const router = useRouter();
  const [city, setCity] = useState<string | null>(null);
  const [loc, setLoc] = useState<{ country: string; state: string; city: string } | null>(null);
  const [locLoaded, setLocLoaded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [when, setWhen] = useState<When>('any');
  const [maxPrice, setMaxPrice] = useState(0);
  const [venue, setVenue] = useState('');
  const [genre, setGenre] = useState('');
  const abort = useRef<AbortController | null>(null);

  // 1) saved city (first login => onboarding; otherwise never asked again)
  useEffect(() => {
    fetch('/api/profile/location').then(r => (r.ok ? r.json() : null)).then(d => {
      if (!d) return;
      if (d.city) { setCity(d.city); setLoc({ country: d.country ?? 'India', state: d.state ?? '', city: d.city }); }
      else if (d.permission === 'unset') router.replace('/onboarding/location?next=/home');
    }).catch(() => {}).finally(() => setLocLoaded(true));
  }, [router]);

  // 2) content for the city; re-runs when the city or a filter changes. Previous in-flight request is cancelled (no duplicates).
  const load = useCallback(async () => {
    if (!city) return;
    abort.current?.abort();
    const ac = new AbortController(); abort.current = ac;
    setLoading(true); setError(null);
    try {
      const p = new URLSearchParams({ city, when });
      if (maxPrice) p.set('maxPrice', String(maxPrice));
      if (venue) p.set('venue', venue);
      if (genre) p.set('genre', genre);
      const r = await fetch(`/api/discover?${p}`, { signal: ac.signal });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? 'Could not load listings.');
      setData(d);
    } catch (e) { if ((e as Error).name !== 'AbortError') setError((e as Error).message || 'Could not load listings.'); }
    finally { if (!ac.signal.aborted) setLoading(false); }
  }, [city, when, maxPrice, venue, genre]);
  useEffect(() => { load(); return () => abort.current?.abort(); }, [load]);

  if (!locLoaded) return null;

  if (!city) {
    return (
      <section className="container-page pt-10">
        <Card className="flex flex-wrap items-center justify-between gap-4 bg-brand-gradient-soft">
          <div>
            <h2 className="text-lg font-semibold text-navy-900">Discover what&apos;s happening around you</h2>
            <p className="mt-1 text-sm text-slate-500">Select your city to see nearby tickets, events and hackathons.</p>
          </div>
          <Button onClick={() => router.push('/onboarding/location?next=/home')}><MapPin className="h-4 w-4" /> Select city</Button>
        </Card>
      </section>
    );
  }

  const registered = (id: string) => data?.registrations?.[id];

  return (
    <section className="container-page pt-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-navy-900">Discover What&apos;s Happening in {city}</h2>
        <Button variant="outline" size="sm" onClick={() => setEditing(v => !v)}><MapPin className="h-4 w-4 text-brand-blue" /> Change city</Button>
      </div>
      {editing && (
        <Card className="mt-4 max-w-md">
          <LocationPicker initial={loc ?? undefined} submitLabel="Update city" onSaved={l => { setCity(l.city); setLoc(l); setEditing(false); setVenue(''); setGenre(''); }} />
        </Card>
      )}

      {error && (
        <Card className="mt-4 flex items-center justify-between gap-3 border-rose-100 bg-rose-50">
          <p className="text-sm text-rose-700">{error}</p><Button size="sm" variant="outline" onClick={load}>Retry</Button>
        </Card>
      )}

      {/* Movies near you */}
      <Block icon={<Film className="h-4 w-4" />} title="Movies Near You" loading={loading && !data}>
        {data && data.movies.length === 0 && <Empty text={`No movies with tickets listed in ${city} yet.`} />}
        {data && data.movies.length > 0 && (
          <div className="flex gap-3 overflow-x-auto pb-2">
            {data.movies.map(m => (
              <button key={m.movie_id} onClick={() => router.push(`/marketplace?q=${encodeURIComponent(m.title)}`)} className="w-32 flex-shrink-0 text-left">
                <div className="aspect-[2/3] overflow-hidden rounded-xl bg-brand-gradient-soft">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {m.poster_url && <img src={m.poster_url} alt={`${m.title} poster`} loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" />}
                </div>
                <p className="mt-1 truncate text-xs font-semibold text-navy-900">{m.title}</p>
                <p className="text-[11px] text-slate-400">{m.tickets} ticket{m.tickets > 1 ? 's' : ''}</p>
              </button>
            ))}
          </div>
        )}
      </Block>

      {/* Tickets */}
      <Block icon={<Ticket className="h-4 w-4" />} title="Available Movie Tickets" loading={loading && !data}
        right={
          <div className="flex flex-wrap items-center gap-2">
            {WHEN.map(w => <button key={w.id} onClick={() => setWhen(w.id)} className={`h-9 rounded-full px-3 text-xs font-medium ${when === w.id ? 'bg-brand-gradient text-white' : 'border border-slate-200 bg-white text-navy-900'}`}>{w.label}</button>)}
            <select aria-label="Price" className={selCls} value={maxPrice} onChange={e => setMaxPrice(Number(e.target.value))}>{PRICES.map(p => <option key={p.v} value={p.v}>{p.l}</option>)}</select>
            {data && data.venues.length > 0 && <select aria-label="Venue" className={selCls} value={venue} onChange={e => setVenue(e.target.value)}><option value="">All venues</option>{data.venues.map(v => <option key={v}>{v}</option>)}</select>}
            {data && data.genres.length > 0 && <select aria-label="Genre" className={selCls} value={genre} onChange={e => setGenre(e.target.value)}><option value="">All genres</option>{data.genres.map(g => <option key={g}>{g}</option>)}</select>}
          </div>
        }>
        {data && data.tickets.length === 0 && <Empty text={`No tickets match in ${city}${when !== 'any' || maxPrice || venue || genre ? ' with these filters' : ' right now'}.`} />}
        {data && data.tickets.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {data.tickets.slice(0, 8).map(t => (
              <Card key={t.listing_id} className="cursor-pointer overflow-hidden !p-0" onClick={() => router.push(`/listing/${t.listing_id}`)}>
                <div className="h-32 w-full bg-brand-gradient-soft">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {t.poster_url && <img src={t.poster_url} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" />}
                </div>
                <div className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-navy-900">{t.movie_title ?? 'Movie'}</p>
                    {t.language && <Badge tone="info">{t.language}</Badge>}
                  </div>
                  <p className="mt-1 truncate text-xs text-slate-400">{t.theatre_name}</p>
                  {t.show_date && <p className="text-xs text-slate-400">{t.show_date} • {formatTime12h(t.show_time ?? '')}</p>}
                  <div className="mt-2 flex items-center justify-between">
                    <p className="text-base font-bold text-navy-900">₹{Number(t.resale_price).toFixed(0)}</p>
                    <span className="text-[11px] text-slate-500">1 ticket{t.seat_label ? ` • ${t.seat_label}` : ''}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {t.verification_status === 'VERIFIED' && <Badge tone="success"><ShieldCheck className="h-3 w-3" /> Verified listing</Badge>}
                    {t.seller_phone_verified && <Badge tone="neutral">Verified seller</Badge>}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </Block>

      {/* Events */}
      <Block icon={<Calendar className="h-4 w-4" />} title="Upcoming Events Near You" loading={loading && !data} more={{ label: 'All events', href: '/events' }}>
        {data && data.events.length === 0 && <Empty text={`No upcoming events in ${city} yet.`} />}
        {data && data.events.length > 0 && <EventGrid items={data.events} registered={registered} />}
      </Block>

      {/* Hackathons */}
      <Block icon={<Code2 className="h-4 w-4" />} title="Hackathons Near You" loading={loading && !data}>
        {data && data.hackathons.length === 0 && <Empty text={`No hackathons listed in ${city} yet.`} />}
        {data && data.hackathons.length > 0 && <EventGrid items={data.hackathons} registered={registered} hackathon />}
      </Block>
    </section>
  );
}

function Block({ icon, title, children, loading, right, more }: { icon: React.ReactNode; title: string; children: React.ReactNode; loading?: boolean; right?: React.ReactNode; more?: { label: string; href: string } }) {
  const router = useRouter();
  return (
    <div className="mt-8">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-base font-semibold text-navy-900"><span className="text-brand-blue">{icon}</span>{title}</h3>
        {right ?? (more && <button className="text-sm font-medium text-brand-blue" onClick={() => router.push(more.href)}>{more.label}</button>)}
      </div>
      {loading ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map(i => <div key={i} className="h-40 animate-pulse rounded-xl2 bg-slate-100" />)}</div> : children}
    </div>
  );
}

const Empty = ({ text }: { text: string }) => <p className="rounded-xl2 border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-400">{text}</p>;

function EventGrid({ items, registered, hackathon }: { items: Ev[]; registered: (id: string) => string | undefined; hackathon?: boolean }) {
  const router = useRouter();
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {items.slice(0, 8).map(e => {
        const reg = registered(e.id);
        return (
          <Card key={e.id} className="cursor-pointer overflow-hidden !p-0" onClick={() => router.push(`/events/${e.id}`)}>
            <div className="h-32 w-full bg-brand-gradient-soft">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {e.poster_url && <img src={e.poster_url} alt="" loading="lazy" className="h-full w-full object-cover" />}
            </div>
            <div className="p-3">
              <p className="truncate text-sm font-semibold text-navy-900">{e.title}</p>
              <p className="mt-1 truncate text-xs text-slate-400">{[e.venue, e.city].filter(Boolean).join(', ')}</p>
              <p className="text-xs text-slate-400">{fmtDate(e.start_at)}</p>
              {(e.organizer_name || e.college_name) && <p className="truncate text-xs text-slate-400">By {e.organizer_name || e.college_name}</p>}
              {hackathon && e.registration_closes_at && <p className="text-xs text-slate-400">Register by {fmtDate(e.registration_closes_at)}</p>}
              <p className="mt-2 text-sm font-bold text-navy-900">{e.registration_type === 'FREE' || !e.amount ? 'Free' : `₹${Number(e.amount).toFixed(0)}`}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {reg ? <Badge tone={reg === 'CONFIRMED' ? 'success' : 'warning'}>{REG_LABEL[reg] ?? reg}</Badge> : <Badge tone={e.status === 'REGISTRATION_OPEN' ? 'success' : 'neutral'}>{STATUS_LABEL[e.status] ?? e.status}</Badge>}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
