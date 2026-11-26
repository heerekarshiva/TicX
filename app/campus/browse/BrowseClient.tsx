'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Search, SlidersHorizontal, PlusCircle, X } from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/utils';
import { CONDITIONS, SORTS } from '@/lib/campus/constants';
import { ProductCard, type CardProduct } from '@/components/campus/ProductCard';
import { CollegePicker } from '@/components/campus/CollegePicker';
import { ProductGridSkeleton, ErrorState, api, selectCls, labelCls, toast } from '@/components/campus/ui';
import { useCategories, useMe } from '@/components/campus/hooks';

type Scope = 'all' | 'my' | 'nearby' | 'select';
const SCOPES: { v: Scope; label: string }[] = [{ v: 'all', label: 'All Colleges' }, { v: 'my', label: 'My College' }, { v: 'nearby', label: 'Nearby Colleges' }, { v: 'select', label: 'Select College' }];

export default function BrowseClient() {
  const router = useRouter(); const path = usePathname(); const sp = useSearchParams();
  const cats = useCategories(); const { me, reload: reloadMe } = useMe();
  const get = (k: string) => sp.get(k) ?? '';
  const scope = (SCOPES.some(s => s.v === get('scope')) ? get('scope') : get('college') ? 'select' : 'all') as Scope;
  const [text, setText] = useState(get('q')); const [filtersOpen, setFiltersOpen] = useState(false);
  const [min, setMin] = useState(get('min')); const [max, setMax] = useState(get('max'));

  const setParams = useCallback((patch: Record<string, string | null>) => {
    const n = new URLSearchParams(sp.toString());
    Object.entries(patch).forEach(([k, v]) => (v ? n.set(k, v) : n.delete(k)));
    router.replace(`${path}${n.toString() ? `?${n}` : ''}`, { scroll: false });
  }, [sp, router, path]);

  // debounce the search box and price inputs so we don't query on every keystroke
  useEffect(() => { const t = setTimeout(() => { if (text !== get('q')) setParams({ q: text.trim() || null }); }, 400); return () => clearTimeout(t); }, [text]); // eslint-disable-line
  useEffect(() => { const t = setTimeout(() => { if (min !== get('min') || max !== get('max')) setParams({ min: min || null, max: max || null }); }, 600); return () => clearTimeout(t); }, [min, max]); // eslint-disable-line

  // Scope -> concrete college/city. "My College" uses the DECLARED college; "Nearby" uses the user's chosen city.
  const myCollege = me?.college?.name ?? ''; const myCity = me?.city ?? me?.college?.city ?? '';
  const scopeCollege = scope === 'my' ? myCollege : scope === 'select' ? get('college') : '';
  const scopeCity = scope === 'nearby' ? myCity : get('city');
  const needsSetup = (scope === 'my' && me && !myCollege) || (scope === 'nearby' && me && !myCity) || ((scope === 'my' || scope === 'nearby') && !me);

  const base = useMemo(() => {
    const p = new URLSearchParams();
    if (get('q')) p.set('q', get('q')); if (get('category')) p.set('category', get('category')); if (get('condition')) p.set('condition', get('condition'));
    if (get('min')) p.set('min', get('min')); if (get('max')) p.set('max', get('max')); if (get('featured')) p.set('featured', '1');
    p.set('sort', SORTS.some(s => s.value === get('sort')) ? get('sort') : 'newest');
    if (scopeCollege) p.set('college', scopeCollege); if (scopeCity) p.set('city', scopeCity);
    return p.toString();
  }, [sp, scopeCollege, scopeCity]); // eslint-disable-line

  const [items, setItems] = useState<CardProduct[]>([]); const [page, setPage] = useState(1); const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true); const [loadingMore, setLoadingMore] = useState(false); const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  const load = useCallback(async (pg: number) => {
    const n = ++seq.current; pg === 1 ? setLoading(true) : setLoadingMore(true); setError(null);
    const r = await api<{ items: CardProduct[]; hasMore: boolean }>(`/api/campus/products?${base}&page=${pg}`);
    if (n !== seq.current) return;
    if (!r.ok) setError(r.error ?? 'Could not load listings.');
    else { setItems(prev => (pg === 1 ? r.data.items : [...prev, ...r.data.items])); setMore(r.data.hasMore); setPage(pg); }
    setLoading(false); setLoadingMore(false);
  }, [base]);
  useEffect(() => { if (!needsSetup) load(1); else { setItems([]); setLoading(false); } }, [load, needsSetup]);

  async function saveCollege(name: string, c?: { city: string; state: string | null }) {
    if (!c) return toast('Pick your college from the list (or add it in Sell Your Product).', 'info');
    const r = await api('/api/campus/me', 'PUT', { collegeName: name, collegeCity: c.city, collegeState: c.state ?? '' });
    if (!r.ok) return toast(r.error ?? 'Could not save.', 'error'); toast('College saved. It stays unverified until our team verifies you.', 'info'); reloadMe();
  }
  const activeFilters = ['category', 'condition', 'min', 'max', 'featured'].filter(k => get(k)).length;
  const title = get('featured') ? 'Featured products' : get('category') ? cats.find(c => c.slug === get('category'))?.name ?? 'Browse' : get('q') ? `Results for “${get('q')}”` : 'Browse everything';

  return (
    <div className="pb-20 lg:pb-0">
      <Navbar />
      <div className="container-page py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><nav className="text-xs text-slate-500"><Link href="/campus" className="hover:text-brand-blue">Campus Marketplace</Link> / Browse</nav><h1 className="mt-1 text-xl font-bold text-navy-900 sm:text-2xl">{title}</h1></div>
          <Link href="/campus/sell"><Button><PlusCircle className="h-4 w-4" />Sell Your Product</Button></Link>
        </div>

        <div className="mt-4 flex flex-col gap-3 md:flex-row">
          <div className="relative flex-1"><Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input value={text} onChange={e => setText(e.target.value)} maxLength={60} aria-label="Search" placeholder="Search products, categories, colleges, cities, sellers…" className="pl-10" /></div>
          <select aria-label="Sort" className={cn(selectCls, 'md:w-52')} value={get('sort') || 'newest'} onChange={e => setParams({ sort: e.target.value === 'newest' ? null : e.target.value })}>
            {SORTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}</select>
          <Button variant="outline" className="md:hidden" onClick={() => setFiltersOpen(v => !v)}><SlidersHorizontal className="h-4 w-4" />Filters{activeFilters ? ` (${activeFilters})` : ''}</Button>
        </div>

        <div className="mt-3 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="College scope">
          {SCOPES.map(s => (<button key={s.v} role="tab" aria-selected={scope === s.v} onClick={() => setParams({ scope: s.v === 'all' ? null : s.v, college: s.v === 'select' ? get('college') || null : null, city: null })}
            className={cn('whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium transition', scope === s.v ? 'border-brand-blue bg-brand-blue text-white' : 'border-slate-200 bg-white text-navy-900 hover:border-brand-blue')}>{s.label}</button>))}
        </div>

        <div className={cn('mt-3 grid gap-3 rounded-xl2 border border-slate-100 bg-white p-4 sm:grid-cols-2 lg:grid-cols-5', filtersOpen ? 'grid' : 'hidden md:grid')}>
          <div><label className={labelCls} htmlFor="f-cat">Category</label>
            <select id="f-cat" className={selectCls} value={get('category')} onChange={e => setParams({ category: e.target.value || null })}><option value="">All categories</option>{cats.map(c => <option key={c.id} value={c.slug}>{c.name}</option>)}</select></div>
          <div><label className={labelCls} htmlFor="f-cond">Condition</label>
            <select id="f-cond" className={selectCls} value={get('condition')} onChange={e => setParams({ condition: e.target.value || null })}><option value="">Any condition</option>{CONDITIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}</select></div>
          <div><label className={labelCls} htmlFor="f-min">Min price (₹)</label><Input id="f-min" inputMode="numeric" value={min} onChange={e => setMin(e.target.value.replace(/\D/g, '').slice(0, 8))} placeholder="0" /></div>
          <div><label className={labelCls} htmlFor="f-max">Max price (₹)</label><Input id="f-max" inputMode="numeric" value={max} onChange={e => setMax(e.target.value.replace(/\D/g, '').slice(0, 8))} placeholder="Any" /></div>
          <div><label className={labelCls} htmlFor="f-city">City</label><Input id="f-city" value={scope === 'nearby' ? myCity : get('city')} disabled={scope === 'nearby'} maxLength={80} placeholder="Any city" onChange={e => setParams({ city: e.target.value.trim() || null })} /></div>
          {scope === 'select' && <div className="sm:col-span-2 lg:col-span-5"><label className={labelCls} htmlFor="f-col">College</label><CollegePicker id="f-col" value={get('college')} onChange={(name, c) => c ? setParams({ college: name, scope: 'select' }) : undefined} placeholder="Search and pick a college…" /></div>}
          {activeFilters > 0 && <button className="inline-flex items-center gap-1 text-sm font-medium text-brand-blue sm:col-span-2 lg:col-span-5" onClick={() => { setMin(''); setMax(''); setParams({ category: null, condition: null, min: null, max: null, featured: null, city: null }); }}><X className="h-4 w-4" />Clear filters</button>}
        </div>

        {scope === 'my' && me && myCollege && <p className="mt-3 text-sm text-slate-600">Showing listings from <b>{myCollege}</b>{me.college?.verified ? ' (verified)' : ' — your college is self-declared and not yet verified.'}</p>}
        {scope === 'nearby' && myCity && <p className="mt-3 text-sm text-slate-600">Showing listings in <b>{myCity}</b>, based on your selected city.</p>}

        <div className="mt-5">
          {needsSetup ? (
            <div className="rounded-xl2 border border-dashed border-slate-200 p-8 text-center">
              {!me ? (<><p className="font-medium text-navy-900">Sign in to use “{scope === 'my' ? 'My College' : 'Nearby Colleges'}”</p><Link href={`/login?redirectTo=${encodeURIComponent(`/campus/browse?scope=${scope}`)}`} className="mt-4 inline-block"><Button>Sign in</Button></Link></>)
              : scope === 'my' ? (<div className="mx-auto max-w-md text-left"><p className="text-center font-medium text-navy-900">Which college do you study at?</p>
                  <p className="mb-3 mt-1 text-center text-sm text-slate-500">This is self-declared. We never assume membership; the verified badge needs our team’s review.</p>
                  <CollegePicker value="" onChange={(n, c) => c && saveCollege(n, c)} /></div>)
              : (<><p className="font-medium text-navy-900">Choose your city first</p><Link href="/onboarding/location" className="mt-4 inline-block"><Button>Set my city</Button></Link></>)}
            </div>
          ) : loading ? <ProductGridSkeleton n={8} />
          : error ? <ErrorState message={error} onRetry={() => load(1)} />
          : items.length === 0 ? <div><EmptyState title="No listings match your search." subtitle="Try different keywords, widen the price range, or switch to All Colleges." />
              <div className="mt-4 text-center"><Link href="/campus/sell"><Button>Sell Your Product</Button></Link></div></div>
          : (<>
              <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">{items.map(p => <ProductCard key={p.id} p={p} />)}</div>
              {more && <div className="mt-6 text-center"><Button variant="outline" disabled={loadingMore} onClick={() => load(page + 1)}>{loadingMore ? 'Loading…' : 'Load more'}</Button></div>}
            </>)}
        </div>
      </div>
      <MobileBottomNav />
    </div>
  );
}
