'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { PlusCircle, Eye, Pencil, Pause, Play, CheckCheck, Trash2, Megaphone } from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/utils';
import { LISTING_STATUS_TONE } from '@/lib/campus/constants';
import { inr, timeAgo } from '@/lib/campus/format';
import { ProductCard, type CardProduct } from '@/components/campus/ProductCard';
import { Inbox } from '@/components/campus/Inbox';
import { ConfirmDialog, Modal, ErrorState, Skeleton, ProductGridSkeleton, api, toast } from '@/components/campus/ui';

const TABS = [['listings', 'My Listings'], ['messages', 'Messages'], ['offers', 'Offers'], ['wishlist', 'Wishlist'], ['promotions', 'Promotions'], ['reports', 'Reports']] as const;
type Tab = (typeof TABS)[number][0];
interface L extends Omit<CardProduct, 'status'> { status: string; views: number; moderation_note: string | null; featured_until: string | null }
interface Stats { total: number; active: number; paused: number; sold: number; pending: number; removed: number; views: number; pendingOffers: number; wishlist: number }

export default function DashboardClient() {
  const router = useRouter(); const path = usePathname(); const sp = useSearchParams();
  const tab = (TABS.some(t => t[0] === sp.get('tab')) ? sp.get('tab') : 'listings') as Tab; const conv = sp.get('c');
  const go = (t: Tab, c?: string | null) => router.replace(`${path}?tab=${t}${c ? `&c=${c}` : ''}`, { scroll: false });
  const [data, setData] = useState<{ listings: L[]; stats: Stats } | null>(null); const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    const r = await api<{ listings: L[]; stats: Stats }>('/api/campus/dashboard');
    if (r.status === 401) return void (window.location.href = '/login?redirectTo=/campus/dashboard');
    r.ok ? setData(r.data) : setErr(r.error ?? 'Could not load your dashboard.');
  }, []);
  useEffect(() => { load(); }, [load]);
  const s = data?.stats;

  return (
    <div className="pb-24 lg:pb-0">
      <Navbar authed />
      <div className="container-page py-6">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><nav className="text-xs text-slate-500"><Link href="/campus" className="hover:text-brand-blue">Campus Marketplace</Link> / Dashboard</nav><h1 className="mt-1 text-2xl font-bold text-navy-900">My Campus Marketplace</h1></div>
          <Link href="/campus/sell"><Button><PlusCircle className="h-4 w-4" />Sell Your Product</Button></Link></div>

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {([['Total listings', s?.total], ['Active', s?.active], ['Sold', s?.sold], ['Total views', s?.views]] as const).map(([l, v]) => (
            <Card key={l}><p className="text-xs text-slate-500">{l}</p><p className="mt-1 text-2xl font-bold text-navy-900">{s ? v : <Skeleton className="h-8 w-12" />}</p></Card>))}
        </div>

        <div className="mt-5 flex gap-1 overflow-x-auto border-b border-slate-100" role="tablist">
          {TABS.map(([k, l]) => (<button key={k} role="tab" aria-selected={tab === k} onClick={() => go(k)} className={cn('relative whitespace-nowrap px-4 py-3 text-sm font-medium', tab === k ? 'text-brand-blue after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:bg-brand-blue' : 'text-slate-500 hover:text-navy-900')}>
            {l}{k === 'offers' && s && s.pendingOffers > 0 && <span className="ml-1.5 rounded-full bg-brand-blue px-1.5 text-[11px] text-white">{s.pendingOffers}</span>}</button>))}
        </div>

        <div className="mt-5">
          {err ? <ErrorState message={err} onRetry={() => { setErr(null); load(); }} />
            : tab === 'listings' ? <Listings data={data} reload={load} />
            : tab === 'messages' ? <Inbox openId={conv} onOpen={id => go('messages', id)} />
            : tab === 'offers' ? <Offers onChange={load} />
            : tab === 'wishlist' ? <Wishlist />
            : tab === 'promotions' ? <Promotions />
            : <Reports />}
        </div>
      </div>
      <MobileBottomNav />
    </div>
  );
}

function Listings({ data, reload }: { data: { listings: L[]; stats: Stats } | null; reload: () => void }) {
  const [filter, setFilter] = useState('all'); const [confirm, setConfirm] = useState<null | { kind: 'delete' | 'sold'; l: L }>(null); const [busy, setBusy] = useState(false); const [promo, setPromo] = useState<L | null>(null);
  if (!data) return <ProductGridSkeleton n={4} />;
  const FILTERS = [['all', 'All'], ['active', 'Active'], ['paused', 'Paused'], ['sold', 'Sold'], ['pending', 'Pending review'], ['removed', 'Removed']] as const;
  const rows = data.listings.filter(l => filter === 'all' || (filter === 'removed' ? ['removed', 'rejected'].includes(l.status) : l.status === filter));
  async function act(l: L, action: 'pause' | 'activate' | 'sold') {
    setBusy(true); const r = await api(`/api/campus/products/${l.id}`, 'PATCH', { action }); setBusy(false); setConfirm(null);
    if (!r.ok) return toast(r.error ?? 'Could not update the listing.', 'error'); toast(action === 'pause' ? 'Listing paused.' : action === 'activate' ? 'Listing is active again.' : 'Marked as sold.'); reload();
  }
  async function del(l: L) {
    setBusy(true); const r = await api(`/api/campus/products/${l.id}`, 'DELETE'); setBusy(false); setConfirm(null);
    if (!r.ok) return toast(r.error ?? 'Could not delete the listing.', 'error'); toast('Listing deleted.'); reload();
  }
  return (
    <>
      <div className="mb-4 flex gap-2 overflow-x-auto">{FILTERS.map(([k, l]) => (<button key={k} onClick={() => setFilter(k)} className={cn('whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm', filter === k ? 'border-brand-blue bg-brand-blue text-white' : 'border-slate-200 bg-white text-navy-900')}>{l}</button>))}</div>
      {rows.length === 0 ? <div><EmptyState title={data.listings.length ? 'No listings in this view.' : 'You haven’t listed anything yet.'} subtitle="Sell books, calculators, hostel items and more to students nearby." />
        {!data.listings.length && <div className="mt-4 text-center"><Link href="/campus/sell"><Button>Sell Your Product</Button></Link></div>}</div> : (
        <div className="space-y-3">{rows.map(l => (
          <Card key={l.id} className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link href={`/campus/product/${l.id}`} className="flex min-w-0 flex-1 items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={l.images[0]} alt="" loading="lazy" className="h-16 w-16 shrink-0 rounded-lg object-cover" />
              <div className="min-w-0"><p className="truncate font-semibold text-navy-900">{l.title}</p><p className="text-sm text-slate-600">{inr(l.selling_price)} · listed {timeAgo(l.created_at)}</p>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500"><Badge tone={LISTING_STATUS_TONE[l.status] ?? 'neutral'} className="capitalize">{l.status === 'pending' ? 'pending review' : l.status}</Badge>{l.featured && <Badge tone="info">Featured</Badge>}<span className="inline-flex items-center gap-1"><Eye className="h-3 w-3" />{l.views}</span></p>
                {l.moderation_note && <p className="mt-1 text-xs text-rose-600">Moderator note: {l.moderation_note}</p>}</div></Link>
            <div className="flex flex-wrap gap-2">
              {['active', 'paused', 'pending'].includes(l.status) && <Link href={`/campus/sell?edit=${l.id}`}><Button size="sm" variant="outline"><Pencil className="h-3.5 w-3.5" />Edit</Button></Link>}
              {l.status === 'active' && <Button size="sm" variant="outline" disabled={busy} onClick={() => act(l, 'pause')}><Pause className="h-3.5 w-3.5" />Pause</Button>}
              {l.status === 'paused' && <Button size="sm" variant="outline" disabled={busy} onClick={() => act(l, 'activate')}><Play className="h-3.5 w-3.5" />Resume</Button>}
              {['active', 'paused'].includes(l.status) && <Button size="sm" variant="outline" onClick={() => setConfirm({ kind: 'sold', l })}><CheckCheck className="h-3.5 w-3.5" />Mark sold</Button>}
              {l.status === 'active' && !l.featured && <Button size="sm" variant="secondary" onClick={() => setPromo(l)}><Megaphone className="h-3.5 w-3.5" />Promote</Button>}
              <Button size="sm" variant="ghost" className="text-rose-600" onClick={() => setConfirm({ kind: 'delete', l })}><Trash2 className="h-3.5 w-3.5" />Delete</Button>
            </div></Card>))}</div>)}
      <ConfirmDialog open={confirm?.kind === 'sold'} title="Mark as sold?" body="The listing will be hidden from buyers and any open offers will be cancelled. This can’t be undone." confirmLabel="Mark as sold" busy={busy} onCancel={() => setConfirm(null)} onConfirm={() => confirm && act(confirm.l, 'sold')} />
      <ConfirmDialog open={confirm?.kind === 'delete'} title="Delete this listing?" body="This permanently deletes the listing, its photos and conversations about it." confirmLabel="Delete" danger busy={busy} onCancel={() => setConfirm(null)} onConfirm={() => confirm && del(confirm.l)} />
      <PromoteModal l={promo} onClose={() => setPromo(null)} />
    </>
  );
}

function PromoteModal({ l, onClose }: { l: L | null; onClose: () => void }) {
  const [plans, setPlans] = useState<{ id: string; name: string; duration_days: number; price: number }[] | null>(null); const [sel, setSel] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { if (l) api<{ plans: any[] }>('/api/campus/promotions').then(r => r.ok && setPlans(r.data.plans)); }, [l]);
  async function go() {
    if (!l) return; setBusy(true); const r = await api('/api/campus/promotions', 'POST', { productId: l.id, planId: sel }); setBusy(false);
    if (!r.ok) return toast(r.error ?? 'Could not request the promotion.', 'error'); toast('Promotion requested. It goes live once our team confirms payment.', 'info'); onClose();
  }
  return (<Modal open={!!l} onClose={onClose} title="Promote this listing">
    <p className="text-sm text-slate-600">Featured listings appear in the Featured section on the marketplace home page.</p>
    <div className="mt-3 space-y-2">{!plans ? <Skeleton className="h-16 w-full" /> : plans.length === 0 ? <p className="text-sm text-slate-500">No promotion plans are available right now.</p> : plans.map(p => (
      <label key={p.id} className={cn('flex cursor-pointer items-center justify-between rounded-xl border p-3 text-sm', sel === p.id ? 'border-brand-blue bg-brand-blue/5' : 'border-slate-200')}>
        <span><input type="radio" name="plan" className="mr-2 accent-[#FF7A00]" checked={sel === p.id} onChange={() => setSel(p.id)} />{p.name} <span className="text-slate-500">({p.duration_days} days)</span></span><b>{p.price > 0 ? inr(p.price) : 'Price on request'}</b></label>))}</div>
    <p className="mt-3 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-900">Payment isn’t automated yet. After you request a promotion, our team will contact you to confirm payment, then activate it. Nothing is charged by this request.</p>
    <div className="mt-4 flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={go} disabled={!sel || busy}>{busy ? 'Requesting…' : 'Request promotion'}</Button></div></Modal>);
}

interface OfferRow { id: string; status: string; offered_price: number; created_at: string; conversation_id: string | null; other_name: string; product: { id: string; title: string; image: string | null; price: number; status: string } | null }
function Offers({ onChange }: { onChange: () => void }) {
  const [box, setBox] = useState<'received' | 'sent'>('received'); const [rows, setRows] = useState<OfferRow[] | null>(null); const [err, setErr] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | { o: OfferRow; action: 'reject' | 'complete' | 'withdraw' }>(null); const [busy, setBusy] = useState(false);
  const load = useCallback(() => { setRows(null); api<{ items: OfferRow[] }>(`/api/campus/offers?box=${box}`).then(r => (r.ok ? setRows(r.data.items) : setErr(r.error ?? 'Could not load offers.'))); }, [box]);
  useEffect(() => { load(); }, [load]);
  async function act(o: OfferRow, action: 'accept' | 'reject' | 'withdraw' | 'complete') {
    setBusy(true); const r = await api(`/api/campus/offers/${o.id}`, 'PATCH', { action }); setBusy(false); setConfirm(null);
    if (!r.ok) return toast(r.error ?? 'Could not update the offer.', 'error');
    toast(action === 'accept' ? 'Offer accepted. Arrange the handover in chat — no payment has been made through MyTICX.' : action === 'complete' ? 'Transaction marked as completed.' : action === 'reject' ? 'Offer declined.' : 'Offer withdrawn.', 'info'); load(); onChange();
  }
  const tone = (s: string) => (s === 'accepted' || s === 'completed' ? 'success' : s === 'pending' ? 'warning' : 'neutral') as 'success' | 'warning' | 'neutral';
  return (<>
    <div className="mb-4 flex gap-2">{(['received', 'sent'] as const).map(b => <button key={b} onClick={() => { setBox(b); setErr(null); }} className={cn('rounded-full border px-4 py-1.5 text-sm capitalize', box === b ? 'border-brand-blue bg-brand-blue text-white' : 'border-slate-200 bg-white')}>{b}</button>)}</div>
    {err ? <ErrorState message={err} onRetry={load} /> : !rows ? <Skeleton className="h-24 w-full" /> : rows.length === 0 ? <EmptyState title={box === 'received' ? 'No offers received yet.' : 'You haven’t sent any offers.'} /> : (
      <div className="space-y-3">{rows.map(o => (
        <Card key={o.id} className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-3">{/* eslint-disable-next-line @next/next/no-img-element */}
            {o.product?.image ? <img src={o.product.image} alt="" loading="lazy" className="h-14 w-14 shrink-0 rounded-lg object-cover" /> : <div className="h-14 w-14 rounded-lg bg-slate-100" />}
            <div className="min-w-0"><p className="truncate font-semibold text-navy-900">{o.product?.title ?? 'Listing removed'}</p>
              <p className="text-sm text-slate-600">Offer <b>{inr(o.offered_price)}</b> <span className="text-slate-400">(asking {o.product ? inr(o.product.price) : '—'})</span></p>
              <p className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">{box === 'received' ? 'From' : 'To'} {o.other_name} · {timeAgo(o.created_at)} <Badge tone={tone(o.status)} className="capitalize">{o.status}</Badge></p></div></div>
          <div className="flex flex-wrap gap-2">
            {o.conversation_id && <Link href={`/campus/dashboard?tab=messages&c=${o.conversation_id}`}><Button size="sm" variant="outline">Chat</Button></Link>}
            {box === 'received' && o.status === 'pending' && <><Button size="sm" disabled={busy} onClick={() => act(o, 'accept')}>Accept</Button><Button size="sm" variant="outline" onClick={() => setConfirm({ o, action: 'reject' })}>Decline</Button></>}
            {box === 'received' && o.status === 'accepted' && <Button size="sm" onClick={() => setConfirm({ o, action: 'complete' })}>Mark completed</Button>}
            {box === 'sent' && ['pending', 'accepted'].includes(o.status) && <Button size="sm" variant="outline" onClick={() => setConfirm({ o, action: 'withdraw' })}>Withdraw</Button>}
          </div></Card>))}</div>)}
    <ConfirmDialog open={!!confirm} busy={busy} onCancel={() => setConfirm(null)} onConfirm={() => confirm && act(confirm.o, confirm.action)} danger={confirm?.action !== 'complete'}
      title={confirm?.action === 'complete' ? 'Mark transaction as completed?' : confirm?.action === 'reject' ? 'Decline this offer?' : 'Withdraw your offer?'}
      body={confirm?.action === 'complete' ? 'Use this once the item has been handed over. The listing will be marked sold and other open offers cancelled. MyTICX does not verify or process the payment.' : confirm?.action === 'reject' ? 'The buyer will be told you declined.' : 'The seller will be told you withdrew your offer.'}
      confirmLabel={confirm?.action === 'complete' ? 'Mark completed' : confirm?.action === 'reject' ? 'Decline' : 'Withdraw'} /></>);
}

function Wishlist() {
  const [items, setItems] = useState<CardProduct[] | null>(null); const [err, setErr] = useState<string | null>(null);
  useEffect(() => { api<{ items: CardProduct[] }>('/api/campus/wishlist').then(r => (r.ok ? setItems(r.data.items) : setErr(r.error ?? 'Could not load your wishlist.'))); }, []);
  if (err) return <ErrorState message={err} />; if (!items) return <ProductGridSkeleton n={4} />;
  if (!items.length) return <div><EmptyState title="Your wishlist is empty." subtitle="Tap “Save to Wishlist” on a listing to keep it here." /><div className="mt-4 text-center"><Link href="/campus/browse"><Button>Browse listings</Button></Link></div></div>;
  return <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">{items.map(p => <ProductCard key={p.id} p={p} />)}</div>;
}

function Promotions() {
  const [rows, setRows] = useState<any[] | null>(null); const [err, setErr] = useState<string | null>(null);
  useEffect(() => { api<{ mine: any[] }>('/api/campus/promotions').then(r => (r.ok ? setRows(r.data.mine) : setErr(r.error ?? 'Could not load promotions.'))); }, []);
  if (err) return <ErrorState message={err} />; if (!rows) return <Skeleton className="h-24 w-full" />;
  if (!rows.length) return <EmptyState title="No promotions yet." subtitle="Use “Promote” on an active listing to request a featured spot." />;
  return <div className="space-y-3">{rows.map(p => (<Card key={p.id} className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-semibold text-navy-900">{p.product_title}</p><p className="text-sm text-slate-600">{p.plan} · {p.amount > 0 ? inr(p.amount) : 'price pending'}{p.end_date ? ` · until ${new Date(p.end_date).toLocaleDateString('en-IN')}` : ''}</p></div>
    <div className="flex gap-2"><Badge tone={p.status === 'active' ? 'success' : p.status === 'pending' ? 'warning' : 'neutral'} className="capitalize">{p.status}</Badge><Badge className="capitalize">{p.payment_status}</Badge></div></Card>))}</div>;
}

function Reports() {
  const [rows, setRows] = useState<any[] | null>(null); const [err, setErr] = useState<string | null>(null);
  useEffect(() => { api<{ items: any[] }>('/api/campus/reports').then(r => (r.ok ? setRows(r.data.items) : setErr(r.error ?? 'Could not load reports.'))); }, []);
  if (err) return <ErrorState message={err} />; if (!rows) return <Skeleton className="h-24 w-full" />;
  if (!rows.length) return <EmptyState title="You haven’t reported any listings." />;
  return <div className="space-y-3">{rows.map(r => (<Card key={r.id} className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-semibold text-navy-900">{r.product_title}</p><p className="text-sm capitalize text-slate-600">{String(r.reason).replace(/_/g, ' ')} · {timeAgo(r.created_at)}</p></div>
    <Badge tone={r.status === 'upheld' ? 'success' : r.status === 'open' ? 'warning' : 'neutral'} className="capitalize">{r.status === 'open' ? 'under review' : r.status}</Badge></Card>))}</div>;
}
