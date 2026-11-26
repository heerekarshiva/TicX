import 'server-only';
import { z } from 'zod';

// OMDb access layer. The API key never leaves the server; the browser talks to /api/omdb/*.
const BASE = () => (process.env.OMDB_API_BASE_URL || 'https://www.omdbapi.com/').replace(/\/?$/, '/');
const KEY = () => process.env.OMDB_API_KEY || '';

export class OmdbError extends Error {
  constructor(public code: 'NOT_CONFIGURED' | 'RATE_LIMITED' | 'UPSTREAM' | 'NOT_FOUND', message: string) { super(message); }
}

const na = (v: unknown) => (typeof v === 'string' && v !== 'N/A' && v.trim() ? v.trim() : null);

const searchItem = z.object({ Title: z.string(), Year: z.string(), imdbID: z.string().regex(/^tt\d{5,10}$/), Type: z.string(), Poster: z.string().optional() });
const searchResp = z.object({ Response: z.string(), Search: z.array(searchItem).optional(), totalResults: z.string().optional(), Error: z.string().optional() });
const detailResp = z.object({
  Response: z.string(), Error: z.string().optional(), imdbID: z.string().optional(), Title: z.string().optional(), Year: z.string().optional(),
  Rated: z.string().optional(), Released: z.string().optional(), Runtime: z.string().optional(), Genre: z.string().optional(), Director: z.string().optional(),
  Actors: z.string().optional(), Plot: z.string().optional(), Language: z.string().optional(), Poster: z.string().optional(), imdbRating: z.string().optional(), Type: z.string().optional()
}).passthrough();

export interface MovieSummary { imdbId: string; title: string; year: string; type: string; poster: string | null }
export interface MovieDetail extends MovieSummary {
  rated: string | null; released: string | null; runtime: string | null; genre: string | null; director: string | null; actors: string | null;
  plot: string | null; language: string | null; imdbRating: string | null;
}

export const posterOrNull = (p: unknown) => { const v = na(p); return v && /^https:\/\//.test(v) ? v : null; };

// --- tiny TTL cache + in-flight de-duplication (per server instance) ---------------------------------
const cache = new Map<string, { v: unknown; exp: number }>();
const inflight = new Map<string, Promise<unknown>>();
const MAX_ENTRIES = 500;

async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) return hit.v as T;
  const running = inflight.get(key);
  if (running) return running as Promise<T>;
  const p = load().then(v => {
    if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
    cache.set(key, { v, exp: Date.now() + ttlMs });
    return v;
  }).finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

async function call(params: Record<string, string>): Promise<unknown> {
  const key = KEY();
  if (!key) throw new OmdbError('NOT_CONFIGURED', 'Movie data is not configured.');
  const url = new URL(BASE());
  url.searchParams.set('apikey', key);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, next: { revalidate: 3600 } });
    if (res.status === 401 || res.status === 429) throw new OmdbError('RATE_LIMITED', 'Movie service limit reached. Try again later.');
    if (!res.ok) throw new OmdbError('UPSTREAM', 'Movie service unavailable.');
    return await res.json();
  } catch (e) {
    if (e instanceof OmdbError) throw e;
    throw new OmdbError('UPSTREAM', 'Movie service unavailable.');
  } finally { clearTimeout(timer); }
}

const isLimit = (msg?: string) => !!msg && /limit/i.test(msg);

export interface SearchOpts { q: string; year?: string; type?: 'movie' | 'series' | 'episode'; page?: number }

export async function searchMovies(o: SearchOpts): Promise<{ items: MovieSummary[]; total: number; page: number }> {
  const page = Math.min(Math.max(o.page ?? 1, 1), 100);
  const key = `s:${o.q.toLowerCase()}|${o.year ?? ''}|${o.type ?? ''}|${page}`;
  return cached(key, 60 * 60_000, async () => {
    const params: Record<string, string> = { s: o.q, page: String(page) };
    if (o.year) params.y = o.year;
    if (o.type) params.type = o.type;
    const parsed = searchResp.safeParse(await call(params));
    if (!parsed.success) throw new OmdbError('UPSTREAM', 'Unexpected response from movie service.');
    const d = parsed.data;
    if (d.Response !== 'True') {
      if (isLimit(d.Error)) throw new OmdbError('RATE_LIMITED', 'Movie service limit reached. Try again later.');
      return { items: [], total: 0, page };   // "Movie not found!" / "Too many results." => empty state
    }
    return {
      items: (d.Search ?? []).map(s => ({ imdbId: s.imdbID, title: s.Title, year: s.Year, type: s.Type, poster: posterOrNull(s.Poster) })),
      total: Number(d.totalResults) || (d.Search?.length ?? 0), page
    };
  });
}

export async function getMovieDetail(imdbId: string): Promise<MovieDetail> {
  return cached(`d:${imdbId}`, 24 * 60 * 60_000, async () => {
    const parsed = detailResp.safeParse(await call({ i: imdbId, plot: 'short' }));
    if (!parsed.success) throw new OmdbError('UPSTREAM', 'Unexpected response from movie service.');
    const d = parsed.data;
    if (d.Response !== 'True' || !d.Title) {
      if (isLimit(d.Error)) throw new OmdbError('RATE_LIMITED', 'Movie service limit reached. Try again later.');
      throw new OmdbError('NOT_FOUND', 'Movie not found.');
    }
    return {
      imdbId: d.imdbID ?? imdbId, title: d.Title, year: d.Year ?? '', type: d.Type ?? 'movie', poster: posterOrNull(d.Poster),
      rated: na(d.Rated), released: na(d.Released), runtime: na(d.Runtime), genre: na(d.Genre), director: na(d.Director), actors: na(d.Actors),
      plot: na(d.Plot), language: na(d.Language), imdbRating: na(d.imdbRating)
    };
  });
}

export function _clearOmdbCacheForTests() { cache.clear(); inflight.clear(); }
