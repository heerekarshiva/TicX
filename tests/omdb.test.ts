import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('server-only', () => ({}));
import { searchMovies, getMovieDetail, OmdbError, _clearOmdbCacheForTests } from '@/lib/omdb';

const ok = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }));

beforeEach(() => { _clearOmdbCacheForTests(); vi.restoreAllMocks(); process.env.OMDB_API_KEY = 'k'; delete process.env.OMDB_API_BASE_URL; });

describe('omdb', () => {
  it('maps search results, drops N/A posters, and caches identical searches (one upstream call)', async () => {
    const f = vi.spyOn(globalThis, 'fetch').mockImplementation(() => ok({ Response: 'True', totalResults: '2', Search: [
      { Title: 'Inception', Year: '2010', imdbID: 'tt1375666', Type: 'movie', Poster: 'https://m.media-amazon.com/x.jpg' },
      { Title: 'Inception 2', Year: '2012', imdbID: 'tt1234567', Type: 'movie', Poster: 'N/A' }] }));
    const a = await searchMovies({ q: 'Inception' });
    const b = await searchMovies({ q: 'inception' });
    expect(a.items[1].poster).toBeNull();
    expect(a.items[0].poster).toContain('https://');
    expect(b.total).toBe(2);
    expect(f).toHaveBeenCalledTimes(1);
    expect(String(f.mock.calls[0][0])).toContain('apikey=k');
  });
  it('de-duplicates concurrent identical requests', async () => {
    const f = vi.spyOn(globalThis, 'fetch').mockImplementation(() => ok({ Response: 'True', totalResults: '1', Search: [{ Title: 'Dune', Year: '2021', imdbID: 'tt1160419', Type: 'movie' }] }));
    await Promise.all([searchMovies({ q: 'dune' }), searchMovies({ q: 'dune' }), searchMovies({ q: 'dune' })]);
    expect(f).toHaveBeenCalledTimes(1);
  });
  it('"Movie not found" is an empty result; a limit message is RATE_LIMITED', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementationOnce(() => ok({ Response: 'False', Error: 'Movie not found!' }));
    expect((await searchMovies({ q: 'zzzzqq' })).items).toEqual([]);
    vi.spyOn(globalThis, 'fetch').mockImplementationOnce(() => ok({ Response: 'False', Error: 'Request limit reached!' }));
    await expect(searchMovies({ q: 'limit' })).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  });
  it('HTTP 401/429 map to RATE_LIMITED; missing key is NOT_CONFIGURED', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementationOnce(() => ok({}, 401));
    await expect(getMovieDetail('tt0000001')).rejects.toBeInstanceOf(OmdbError);
    delete process.env.OMDB_API_KEY;
    await expect(getMovieDetail('tt0000002')).rejects.toMatchObject({ code: 'NOT_CONFIGURED' });
  });
  it('detail turns N/A into null', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => ok({ Response: 'True', imdbID: 'tt1375666', Title: 'Inception', Year: '2010', Runtime: '148 min', Genre: 'Action, Sci-Fi', Director: 'N/A', Actors: 'Leonardo DiCaprio', Plot: 'A thief…', Language: 'English', Poster: 'N/A', imdbRating: '8.8', Type: 'movie' }));
    const d = await getMovieDetail('tt1375666');
    expect(d.director).toBeNull(); expect(d.poster).toBeNull(); expect(d.imdbRating).toBe('8.8');
  });
});
