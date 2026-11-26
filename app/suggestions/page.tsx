'use client';
<<<<<<< HEAD
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Star, Search, X, Film } from 'lucide-react';
=======
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Star, Search } from 'lucide-react';
>>>>>>> 952ded43d45a4b3be5481656a06799a8854925de
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';

interface Item { title: string; rating: string | null; poster: string | null; year: string | null; genre: string | null; ott: string[] }
<<<<<<< HEAD
interface Found { imdbId: string; title: string; year: string; type: string; poster: string | null }
interface Detail extends Found { rated: string | null; released: string | null; runtime: string | null; genre: string | null; director: string | null; actors: string | null; plot: string | null; language: string | null; imdbRating: string | null }
interface Listing { listing_id: string; resale_price: number; theatre_name: string | null; show_date: string | null; show_time: string | null }

const selCls = 'h-11 rounded-full border border-ticx-border bg-white px-4 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue';

function Poster({ src, title }: { src: string | null; title: string }) {
  const [bad, setBad] = useState(false);
  if (!src || bad) return <div className="flex h-full w-full items-center justify-center text-white/40"><Film className="h-10 w-10" aria-label="Poster unavailable" /></div>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={`${title} poster`} loading="lazy" referrerPolicy="no-referrer" onError={() => setBad(true)} className="h-full w-full object-cover" />;
}

export default function SuggestionsPage() {
  // featured picks (existing behaviour: IMDb rating + OTT)
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [cfg, setCfg] = useState({ imdb: true, ott: true });

  // OMDb search
  const [q, setQ] = useState('');
  const [year, setYear] = useState('');
  const [type, setType] = useState('');
  const [active, setActive] = useState<{ q: string; year: string; type: string } | null>(null);
  const [found, setFound] = useState<Found[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  // details modal
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [city, setCity] = useState<string | null>(null);
  const [tickets, setTickets] = useState<Listing[] | null>(null);
  const detailCache = useRef(new Map<string, Detail>());

  useEffect(() => {
    fetch('/api/suggestions').then(r => r.json()).then(d => { setItems(d.items ?? []); setCfg(d.configured); }).catch(() => {}).finally(() => setLoading(false));
    fetch('/api/profile/location').then(r => (r.ok ? r.json() : null)).then(d => d?.city && setCity(d.city)).catch(() => {});
  }, []);

  async function runSearch(next: { q: string; year: string; type: string }, pg = 1) {
    abort.current?.abort();                       // never run two searches at once
    const ac = new AbortController(); abort.current = ac;
    setSearching(true); setError(null);
    try {
      const p = new URLSearchParams({ q: next.q, page: String(pg) });
      if (next.year) p.set('year', next.year);
      if (next.type) p.set('type', next.type);
      const r = await fetch(`/api/omdb/search?${p}`, { signal: ac.signal });
      const d = await r.json();
      if (!r.ok) { setError(r.status === 429 ? 'Too many searches right now — please try again in a minute.' : d.error ?? 'Search failed.'); if (pg === 1) setFound([]); return; }
      setActive(next); setPage(pg); setTotal(d.total);
      setFound(prev => (pg === 1 ? d.items : [...prev, ...d.items.filter((n: Found) => !prev.some(o => o.imdbId === n.imdbId))]));
    } catch (e) { if ((e as Error).name !== 'AbortError') setError('Could not reach the movie service. Please try again.'); }
    finally { if (!ac.signal.aborted) setSearching(false); }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const term = q.trim();
    if (term.length < 2) { setActive(null); setFound([]); setError(null); return; }
    runSearch({ q: term, year: year.trim(), type });
  }

  async function openDetail(m: Found) {
    setDetail(null); setDetailError(null); setTickets(null);
    const cached = detailCache.current.get(m.imdbId);
    let d = cached ?? null;
    if (!d) {
      setDetailLoading(true);
      try {
        const r = await fetch(`/api/omdb/detail?id=${m.imdbId}`);
        const j = await r.json();
        if (!r.ok) { setDetail({ ...m } as Detail); setDetailError(r.status === 429 ? 'Movie service limit reached — details unavailable for now.' : j.error ?? 'Could not load details.'); setDetailLoading(false); return; }
        d = j.movie as Detail; detailCache.current.set(m.imdbId, d);
      } catch { setDetail({ ...m } as Detail); setDetailError('Could not load details.'); setDetailLoading(false); return; }
      setDetailLoading(false);
    }
    setDetail(d);
    // Real MyTICX listings only (never invented): this movie, in the user's city when known.
    const p = new URLSearchParams({ movie: d.title });
    if (city) p.set('location', city);
    fetch(`/api/listings?${p}`).then(r => r.json()).then(j => setTickets((j.listings ?? []).slice(0, 5))).catch(() => setTickets([]));
  }

  const hasMore = active && found.length < total;
=======

export default function SuggestionsPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [cfg, setCfg] = useState({ imdb: true, ott: true });

  async function load(query = '') {
    setLoading(true);
    const d = await fetch(`/api/suggestions${query ? `?q=${encodeURIComponent(query)}` : ''}`).then(r => r.json()).catch(() => null);
    if (d) { setItems(d.items ?? []); setCfg(d.configured); }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);
>>>>>>> 952ded43d45a4b3be5481656a06799a8854925de

  return (
    <div>
      <Navbar authed />
      <main className="container-page py-8">
        <h1 className="text-2xl font-bold text-navy-900">Movie picks</h1>
        <p className="mt-1 text-sm text-ticx-textmuted">IMDb ratings and where to watch at home. Found a movie you love? See if someone is selling tickets.</p>
<<<<<<< HEAD
        <form onSubmit={onSubmit} className="mt-5 flex flex-wrap items-center gap-2">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search a movie title" maxLength={80} aria-label="Movie title"
              className="h-11 w-full rounded-full border border-ticx-border pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue" />
          </div>
          <input value={year} onChange={e => setYear(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="Year" inputMode="numeric" aria-label="Release year" className={`${selCls} w-24`} />
          <select value={type} onChange={e => setType(e.target.value)} aria-label="Type" className={selCls}>
            <option value="">All types</option><option value="movie">Movies</option><option value="series">Series</option>
          </select>
          <button type="submit" disabled={searching} className="h-11 rounded-full bg-brand-blue px-5 text-sm font-semibold text-white hover:bg-brand-bluedark disabled:opacity-50">{searching && page === 1 ? 'Searching…' : 'Search'}</button>
          {active && <button type="button" onClick={() => { setActive(null); setFound([]); setQ(''); setYear(''); setType(''); setError(null); }} className="text-sm font-medium text-brand-blue">Clear</button>}
        </form>
        {!cfg.imdb && <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Add OMDB_API_KEY to your environment to show IMDb ratings{!cfg.ott && ', and TMDB_API_KEY to show OTT platforms'}.</p>}
        {error && <p role="alert" className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}

        {active ? (
          <>
            <p className="mt-6 text-sm text-ticx-textmuted">{searching && page === 1 ? 'Searching…' : `${total} result${total === 1 ? '' : 's'} for “${active.q}”`}</p>
            {!searching && found.length === 0 && !error && <p className="mt-6 rounded-xl border border-dashed border-ticx-border p-8 text-center text-sm text-ticx-textmuted">No movies found. Try a different title, year or type.</p>}
            <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {found.map(m => (
                <div key={m.imdbId} className="overflow-hidden rounded-2xl border border-ticx-border bg-white">
                  <div className="aspect-[2/3] bg-navy-900"><Poster src={m.poster} title={m.title} /></div>
                  <div className="p-4">
                    <h2 className="font-semibold text-navy-900">{m.title}</h2>
                    <p className="text-xs capitalize text-ticx-textmuted">{m.year} · {m.type}</p>
                    <button onClick={() => openDetail(m)} className="mt-3 block w-full rounded-lg border border-brand-blue py-2 text-center text-sm font-semibold text-brand-blue hover:bg-brand-gradient-soft">View details</button>
                    <Link href={`/marketplace?q=${encodeURIComponent(m.title)}`} className="mt-2 block rounded-lg bg-brand-blue py-2 text-center text-sm font-semibold text-white hover:bg-brand-bluedark">Find tickets</Link>
                  </div>
                </div>
              ))}
            </div>
            {hasMore && <div className="mt-6 text-center"><button disabled={searching} onClick={() => active && runSearch(active, page + 1)} className="rounded-full border border-ticx-border px-6 py-2.5 text-sm font-semibold text-navy-900 hover:bg-slate-50 disabled:opacity-50">{searching ? 'Loading…' : 'Load more'}</button></div>}
          </>
        ) : (
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {loading ? <p className="text-sm text-ticx-textmuted">Loading picks…</p> : items.map(m => (
              <div key={m.title} className="overflow-hidden rounded-2xl border border-ticx-border bg-white">
                <div className="aspect-[2/3] bg-navy-900"><Poster src={m.poster} title={m.title} /></div>
                <div className="p-4">
                  <h2 className="font-semibold text-navy-900">{m.title}</h2>
                  <p className="text-xs text-ticx-textmuted">{[m.year, m.genre].filter(Boolean).join(', ')}</p>
                  {m.rating && <p className="mt-2 inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-sm font-bold text-amber-700"><Star className="h-4 w-4 fill-amber-500 text-amber-500" />{m.rating}<span className="text-xs font-normal">/10 IMDb</span></p>}
                  {m.ott.length > 0 && <p className="mt-2 text-xs text-slate-600">Watch on: <span className="font-medium">{m.ott.join(', ')}</span></p>}
                  <Link href={`/marketplace?q=${encodeURIComponent(m.title)}`} className="mt-3 block rounded-lg bg-brand-blue py-2 text-center text-sm font-semibold text-white hover:bg-brand-bluedark">Find tickets</Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {(detail || detailLoading) && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" onClick={() => { setDetail(null); setDetailLoading(false); }}>
          <div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-t-2xl bg-white p-5 sm:rounded-2xl" onClick={e => e.stopPropagation()}>
            <button className="float-right rounded-full p-1 text-slate-500 hover:bg-slate-100" aria-label="Close" onClick={() => { setDetail(null); setDetailLoading(false); }}><X className="h-5 w-5" /></button>
            {detailLoading && <div className="h-64 animate-pulse rounded-xl bg-slate-100" />}
            {detail && (
              <div className="flex flex-col gap-5 sm:flex-row">
                <div className="aspect-[2/3] w-40 flex-shrink-0 self-center overflow-hidden rounded-xl bg-navy-900 sm:self-start"><Poster src={detail.poster} title={detail.title} /></div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-xl font-bold text-navy-900">{detail.title} <span className="text-base font-normal text-slate-400">({detail.year})</span></h2>
                  {detailError && <p className="mt-2 text-sm text-amber-700">{detailError}</p>}
                  {detail.imdbRating && <p className="mt-2 inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-sm font-bold text-amber-700"><Star className="h-4 w-4 fill-amber-500 text-amber-500" />{detail.imdbRating}<span className="text-xs font-normal">/10 IMDb</span></p>}
                  <dl className="mt-3 space-y-1 text-sm text-slate-600">
                    {([['Genre', detail.genre], ['Runtime', detail.runtime], ['Language', detail.language], ['Director', detail.director], ['Actors', detail.actors]] as const).map(([k, v]) => v && <div key={k}><dt className="inline font-medium text-navy-900">{k}: </dt><dd className="inline">{v}</dd></div>)}
                  </dl>
                  {detail.plot && <p className="mt-3 text-sm text-slate-600">{detail.plot}</p>}
                  <div className="mt-4 rounded-xl bg-brand-gradient-soft p-3">
                    <p className="text-sm font-semibold text-navy-900">Tickets on MyTICX{city ? ` in ${city}` : ''}</p>
                    {tickets === null ? <p className="mt-1 text-xs text-slate-500">Checking listings…</p>
                      : tickets.length === 0 ? <p className="mt-1 text-xs text-slate-500">No tickets listed for this movie{city ? ` in ${city}` : ''} right now.</p>
                      : <ul className="mt-2 space-y-1">{tickets.map(t => <li key={t.listing_id}><Link className="flex justify-between text-xs text-navy-900 hover:underline" href={`/listing/${t.listing_id}`}><span>{t.theatre_name} · {t.show_date}</span><span className="font-semibold">₹{Number(t.resale_price).toFixed(0)}</span></Link></li>)}</ul>}
                    <Link href={`/marketplace?q=${encodeURIComponent(detail.title)}`} className="mt-2 inline-block text-xs font-semibold text-brand-blue">See all tickets →</Link>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
=======
        <form onSubmit={e => { e.preventDefault(); load(q.trim()); }} className="relative mt-5 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search a movie title"
            className="h-11 w-full rounded-full border border-ticx-border pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue" />
        </form>
        {!cfg.imdb && <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Add OMDB_API_KEY to your environment to show IMDb ratings{!cfg.ott && ', and TMDB_API_KEY to show OTT platforms'}.</p>}

        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {loading ? <p className="text-sm text-ticx-textmuted">Loading picks…</p> : items.map(m => (
            <div key={m.title} className="overflow-hidden rounded-2xl border border-ticx-border bg-white">
              <div className="aspect-[2/3] bg-navy-900">{m.poster && <img src={m.poster} alt={`${m.title} poster`} className="h-full w-full object-cover" />}</div>
              <div className="p-4">
                <h2 className="font-semibold text-navy-900">{m.title}</h2>
                <p className="text-xs text-ticx-textmuted">{[m.year, m.genre].filter(Boolean).join(', ')}</p>
                {m.rating && <p className="mt-2 inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-sm font-bold text-amber-700"><Star className="h-4 w-4 fill-amber-500 text-amber-500" />{m.rating}<span className="text-xs font-normal">/10 IMDb</span></p>}
                {m.ott.length > 0 && <p className="mt-2 text-xs text-slate-600">Watch on: <span className="font-medium">{m.ott.join(', ')}</span></p>}
                <Link href={`/marketplace?q=${encodeURIComponent(m.title)}`} className="mt-3 block rounded-lg bg-brand-blue py-2 text-center text-sm font-semibold text-white hover:bg-brand-bluedark">Find tickets</Link>
              </div>
            </div>
          ))}
        </div>
      </main>
>>>>>>> 952ded43d45a4b3be5481656a06799a8854925de
      <Footer />
    </div>
  );
}
