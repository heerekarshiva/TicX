'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AdminShell, Toggle } from '@/components/events/AdminShell';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/utils';
import { inr, timeAgo } from '@/lib/campus/format';
import { LISTING_STATUS_TONE } from '@/lib/campus/constants';
import { Modal, Toaster, ErrorState, Skeleton, api, toast, selectCls, labelCls } from '@/components/campus/ui';

const TABS = [['overview', 'Overview'], ['listings', 'Listings'], ['reports', 'Reports'], ['sellers', 'Sellers'], ['categories', 'Categories'], ['pricing', 'Pricing & promotions'], ['settings', 'Settings']] as const;
type Tab = (typeof TABS)[number][0];

// Small hook: GET /api/admin/campus/<resource>?<query>. Authorization is enforced by the API (requireAdmin) on every call.
function useRes<T = any>(resource: string, query = '') {
  const [data, setData] = useState<T | null>(null); const [err, setErr] = useState<string | null>(null); const [n, setN] = useState(0);
  useEffect(() => { let live = true; setData(null); setErr(null);
    api<T>(`/api/admin/campus/${resource}${query ? `?${query}` : ''}`).then(r => { if (!live) return; r.ok ? setData(r.data) : setErr(r.error ?? 'Could not load.'); }); return () => { live = false; }; }, [resource, query, n]);
  return { data, err, reload: () => setN(x => x + 1) };
}
const Wrap = ({ err, data, reload, children }: { err: string | null; data: unknown; reload: () => void; children: React.ReactNode }) =>
  err ? <ErrorState message={err} onRetry={reload} /> : !data ? <div className="space-y-2"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div> : <>{children}</>;

export default function AdminCampusPage() {
  const [tab, setTab] = useState<Tab>('overview');
  return (
    <AdminShell title="Campus Marketplace" action={<Link href="/campus" className="text-sm font-semibold text-brand-blue">View marketplace →</Link>}>
      <div className="mb-4 flex gap-1 overflow-x-auto">{TABS.map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={cn('whitespace-nowrap rounded-full border px-4 py-1.5 text-sm font-medium', tab === k ? 'border-brand-blue bg-brand-blue text-white' : 'border-slate-200 bg-white text-navy-900')}>{l}</button>)}</div>
      {tab === 'overview' && <Overview />}{tab === 'listings' && <Listings />}{tab === 'reports' && <Reports />}{tab === 'sellers' && <Sellers />}
      {tab === 'categories' && <Categories />}{tab === 'pricing' && <Pricing />}{tab === 'settings' && <Settings />}
      <Toaster />
    </AdminShell>
  );
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return <Card><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold text-navy-900">{value}</p>{hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}</Card>;
}
function Overview() {
  const { data: d, err, reload } = useRes<any>('overview');
  return <Wrap err={err} data={d} reload={reload}>{d && (<div className="space-y-5">
    <div><h2 className="mb-2 text-sm font-semibold text-navy-900">Marketplace</h2><div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      <Stat label="Active listings" value={d.listings.active} /><Stat label="Pending review" value={d.listings.pending} /><Stat label="Paused" value={d.listings.paused} /><Stat label="Sold" value={d.listings.sold} /><Stat label="Open reports" value={d.openReports} /></div></div>
    <div><h2 className="mb-2 text-sm font-semibold text-navy-900">Revenue</h2><div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      <Stat label="Featured listings (ever activated)" value={d.promotions.everActivated} /><Stat label="Active promotions" value={d.promotions.active} hint={`${d.promotions.pending} awaiting payment`} />
      <Stat label="Promotion revenue" value={inr(d.promotions.revenue) || '₹0'} hint={`${d.promotions.paidCount} paid promotion(s)`} />
      <Stat label="Completed transactions" value={d.transactions.completed} hint={`${d.transactions.unverified} not payment-verified`} />
      <Stat label="Commission revenue" value={inr(d.transactions.commissionRevenue) || '₹0'} hint={d.transactions.commissionRatePercent > 0 ? `Rate ${d.transactions.commissionRatePercent}% (verified only)` : 'Commission is off'} /></div>
      <p className="mt-3 text-xs text-slate-500">Figures are computed from real records only. Promotion revenue counts promotions you marked as paid. Commission counts only payment-verified transactions; no payment gateway is connected yet, so it stays ₹0 until one is added.</p></div>
  </div>)}</Wrap>;
}

function NoteModal({ open, title, label, required, onClose, onSubmit }: { open: boolean; title: string; label: string; required?: boolean; onClose: () => void; onSubmit: (note: string) => Promise<void> }) {
  const [v, setV] = useState(''); const [busy, setBusy] = useState(false);
  return <Modal open={open} onClose={onClose} title={title}><label className={labelCls} htmlFor="note">{label}</label><Input id="note" value={v} maxLength={300} onChange={e => setV(e.target.value)} />
    <div className="mt-4 flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={busy || (required && !v.trim())} onClick={async () => { setBusy(true); await onSubmit(v); setBusy(false); setV(''); }}>Confirm</Button></div></Modal>;
}

function Listings() {
  const [status, setStatus] = useState('pending'); const [q, setQ] = useState(''); const [qq, setQq] = useState('');
  useEffect(() => { const t = setTimeout(() => setQq(q), 400); return () => clearTimeout(t); }, [q]);
  const { data, err, reload } = useRes<{ items: any[] }>('products', `status=${status}&q=${encodeURIComponent(qq)}`);
  const [act, setAct] = useState<null | { id: string; action: 'reject' | 'remove' }>(null);
  async function run(id: string, action: string, note?: string) {
    const r = await api('/api/admin/campus/products', 'PATCH', { id, action, note: note || undefined });
    r.ok ? (toast('Listing updated.'), reload()) : toast(r.error ?? 'Failed.', 'error'); setAct(null);
  }
  return (<>
    <div className="mb-3 flex flex-wrap gap-2"><select aria-label="Status" className={cn(selectCls, 'sm:w-48')} value={status} onChange={e => setStatus(e.target.value)}>
      {['pending', 'active', 'paused', 'sold', 'removed', 'rejected'].map(s => <option key={s} value={s}>{s}</option>)}</select><Input className="sm:w-64" placeholder="Search title…" value={q} onChange={e => setQ(e.target.value)} /></div>
    <Wrap err={err} data={data} reload={reload}>{data && (data.items.length === 0 ? <p className="py-10 text-center text-sm text-slate-500">No {status} listings.</p> : <div className="space-y-2">{data.items.map(l => (
      <Card key={l.id} className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}<img src={l.images[0]} alt="" loading="lazy" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
        <div className="min-w-0 flex-1"><Link href={`/campus/product/${l.id}`} target="_blank" className="block truncate font-semibold text-navy-900 hover:text-brand-blue">{l.title}</Link>
          <p className="text-xs text-slate-500">{inr(l.selling_price)} · {l.seller.name} · {l.college_name}, {l.city} · {timeAgo(l.created_at)}</p>
          <div className="mt-1 flex gap-2"><Badge tone={LISTING_STATUS_TONE[l.status] ?? 'neutral'} className="capitalize">{l.status}</Badge>{l.featured && <Badge tone="info">Featured</Badge>}</div>{l.moderation_note && <p className="mt-1 text-xs text-slate-500">Note: {l.moderation_note}</p>}</div>
        <div className="flex flex-wrap gap-2">
          {['pending', 'rejected'].includes(l.status) && <Button size="sm" onClick={() => run(l.id, 'approve')}>Approve</Button>}
          {l.status === 'pending' && <Button size="sm" variant="outline" onClick={() => setAct({ id: l.id, action: 'reject' })}>Reject</Button>}
          {['active', 'paused', 'pending'].includes(l.status) && <Button size="sm" variant="outline" className="text-rose-600" onClick={() => setAct({ id: l.id, action: 'remove' })}>Remove</Button>}
          {l.status === 'removed' && <Button size="sm" variant="outline" onClick={() => run(l.id, 'restore')}>Restore</Button>}</div></Card>))}</div>)}</Wrap>
    <NoteModal open={!!act} title={act?.action === 'reject' ? 'Reject listing' : 'Remove listing'} label="Reason shown to the seller" onClose={() => setAct(null)} onSubmit={n => run(act!.id, act!.action, n)} /></>);
}

function Reports() {
  const [st, setSt] = useState('open'); const { data, err, reload } = useRes<{ items: any[] }>('reports', `status=${st}`);
  async function run(id: string, action: 'uphold' | 'dismiss', removeListing?: boolean) { const r = await api('/api/admin/campus/reports', 'PATCH', { id, action, removeListing }); r.ok ? (toast(action === 'uphold' ? 'Report upheld.' : 'Report dismissed.'), reload()) : toast(r.error ?? 'Failed.', 'error'); }
  return (<>
    <select aria-label="Report status" className={cn(selectCls, 'mb-3 sm:w-48')} value={st} onChange={e => setSt(e.target.value)}>{['open', 'upheld', 'dismissed', 'all'].map(s => <option key={s} value={s}>{s}</option>)}</select>
    <Wrap err={err} data={data} reload={reload}>{data && (data.items.length === 0 ? <p className="py-10 text-center text-sm text-slate-500">No {st === 'all' ? '' : st} reports.</p> : <div className="space-y-2">{data.items.map(r => (
      <Card key={r.id} className="flex flex-col gap-3 sm:flex-row sm:items-center"><div className="min-w-0 flex-1">
        <p className="font-semibold text-navy-900">{r.product ? <Link target="_blank" href={`/campus/product/${r.product.id}`} className="hover:text-brand-blue">{r.product.title}</Link> : 'Deleted listing'} {r.product && <Badge tone={LISTING_STATUS_TONE[r.product.status] ?? 'neutral'} className="ml-1 capitalize">{r.product.status}</Badge>}</p>
        <p className="text-sm capitalize text-slate-600">{String(r.reason).replace(/_/g, ' ')} · by {r.reporter_name} · {timeAgo(r.created_at)}</p>{r.details && <p className="mt-1 text-sm text-slate-500">“{r.details}”</p>}</div>
        {r.status === 'open' ? <div className="flex flex-wrap gap-2"><Button size="sm" className="!bg-rose-600 !bg-none" onClick={() => run(r.id, 'uphold', true)}>Uphold & remove listing</Button><Button size="sm" variant="outline" onClick={() => run(r.id, 'uphold', false)}>Uphold only</Button><Button size="sm" variant="outline" onClick={() => run(r.id, 'dismiss')}>Dismiss</Button></div> : <Badge className="capitalize">{r.status}</Badge>}</Card>))}</div>)}</Wrap></>);
}

function Sellers() {
  const [filter, setFilter] = useState('unverified'); const [q, setQ] = useState(''); const [qq, setQq] = useState('');
  useEffect(() => { const t = setTimeout(() => setQq(q), 400); return () => clearTimeout(t); }, [q]);
  const { data, err, reload } = useRes<{ items: any[] }>('sellers', `filter=${filter}&q=${encodeURIComponent(qq)}`);
  const [sus, setSus] = useState<string | null>(null);
  async function run(userId: string, action: string, reason?: string) { const r = await api('/api/admin/campus/sellers', 'PATCH', { userId, action, reason: reason || undefined }); r.ok ? (toast('Seller updated.'), reload()) : toast(r.error ?? 'Failed.', 'error'); setSus(null); }
  return (<>
    <p className="mb-3 text-sm text-slate-600">Students appear here after declaring a college. “Verify” is a manual decision (for example, after checking a college ID or college email) — it is what turns on the public “Verified student” badge.</p>
    <div className="mb-3 flex flex-wrap gap-2"><select aria-label="Filter" className={cn(selectCls, 'sm:w-48')} value={filter} onChange={e => setFilter(e.target.value)}>{['unverified', 'verified', 'suspended'].map(s => <option key={s} value={s}>{s}</option>)}</select><Input className="sm:w-72" placeholder="Search name or email…" value={q} onChange={e => setQ(e.target.value)} /></div>
    <Wrap err={err} data={data} reload={reload}>{data && (data.items.length === 0 ? <p className="py-10 text-center text-sm text-slate-500">Nobody here.</p> : <div className="space-y-2">{data.items.map(s => (
      <Card key={s.user_id} className="flex flex-col gap-3 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><p className="font-semibold text-navy-900">{s.name} <span className="text-sm font-normal text-slate-500">{s.email}</span></p>
        <p className="text-sm text-slate-600">{s.college_name ?? 'No college declared'}{s.college_city ? `, ${s.college_city}` : ''} · {s.active}/{s.listings} listings active</p>
        <div className="mt-1 flex gap-2">{s.verified && <Badge tone="success">Verified</Badge>}{s.suspended && <Badge tone="danger">Suspended</Badge>}</div>{s.suspended_reason && <p className="mt-1 text-xs text-slate-500">Reason: {s.suspended_reason}</p>}</div>
        <div className="flex flex-wrap gap-2">{s.verified ? <Button size="sm" variant="outline" onClick={() => run(s.user_id, 'unverify')}>Remove verification</Button> : <Button size="sm" onClick={() => run(s.user_id, 'verify')}>Verify student</Button>}
          {s.suspended ? <Button size="sm" variant="outline" onClick={() => run(s.user_id, 'unsuspend')}>Lift suspension</Button> : <Button size="sm" variant="outline" className="text-rose-600" onClick={() => setSus(s.user_id)}>Suspend</Button>}</div></Card>))}</div>)}</Wrap>
    <NoteModal open={!!sus} title="Suspend seller" label="Reason (internal)" onClose={() => setSus(null)} onSubmit={r => run(sus!, 'suspend', r)} /></>);
}

function Categories() {
  const { data, err, reload } = useRes<{ items: any[] }>('categories'); const [name, setName] = useState(''); const [desc, setDesc] = useState('');
  async function call(m: string, url: string, body?: unknown, ok = 'Saved.') { const r = await api(url, m, body); r.ok ? (toast(ok), reload()) : toast(r.error ?? 'Failed.', 'error'); return r.ok; }
  return (<>
    <Card className="mb-4"><h2 className="mb-2 text-sm font-semibold text-navy-900">Add category</h2><div className="flex flex-col gap-2 sm:flex-row"><Input placeholder="Name" value={name} maxLength={60} onChange={e => setName(e.target.value)} /><Input placeholder="Description (optional)" value={desc} maxLength={400} onChange={e => setDesc(e.target.value)} />
      <Button disabled={name.trim().length < 2} onClick={async () => { if (await call('POST', '/api/admin/campus/categories', { name, description: desc || undefined }, 'Category added.')) { setName(''); setDesc(''); } }}>Add</Button></div></Card>
    <Wrap err={err} data={data} reload={reload}>{data && <div className="space-y-2">{data.items.map(c => <CatRow key={c.id} c={c} call={call} />)}</div>}</Wrap></>);
}
function CatRow({ c, call }: { c: any; call: (m: string, u: string, b?: unknown, ok?: string) => Promise<boolean> }) {
  const [name, setName] = useState(c.name); const [order, setOrder] = useState(String(c.sort_order));
  return <Card className="flex flex-col gap-2 sm:flex-row sm:items-center"><Input className="sm:max-w-xs" value={name} maxLength={60} onChange={e => setName(e.target.value)} aria-label="Category name" />
    <Input className="sm:w-24" inputMode="numeric" value={order} onChange={e => setOrder(e.target.value.replace(/\D/g, '').slice(0, 3))} aria-label="Sort order" />
    <Toggle label="Active" checked={c.is_active} onChange={v => call('PATCH', '/api/admin/campus/categories', { id: c.id, is_active: v })} />
    <div className="ml-auto flex gap-2"><Button size="sm" onClick={() => call('PATCH', '/api/admin/campus/categories', { id: c.id, name, sort_order: Number(order) || 0 })}>Save</Button>
      <Button size="sm" variant="outline" className="text-rose-600" onClick={() => confirm(`Delete “${c.name}”? Only possible if it has no listings.`) && call('DELETE', `/api/admin/campus/categories?id=${c.id}`, undefined, 'Category deleted.')}>Delete</Button></div></Card>;
}

function Pricing() {
  const plans = useRes<{ items: any[] }>('plans'); const promos = useRes<{ items: any[] }>('promotions', 'status=');
  const [n, setN] = useState(''); const [d, setD] = useState('7'); const [p, setP] = useState('');
  async function call(m: string, url: string, body: unknown, ok: string, after: () => void) { const r = await api(url, m, body); r.ok ? (toast(ok), after()) : toast(r.error ?? 'Failed.', 'error'); }
  return (<div className="space-y-6">
    <section><h2 className="mb-2 text-sm font-semibold text-navy-900">Featured-listing plans</h2><p className="mb-3 text-xs text-slate-500">Prices are set manually. Changing a plan never alters promotions that were already requested (their price is snapshotted).</p>
      <Wrap err={plans.err} data={plans.data} reload={plans.reload}>{plans.data && <div className="space-y-2">{plans.data.items.map(pl => <PlanRow key={pl.id} pl={pl} save={b => call('PATCH', '/api/admin/campus/plans', b, 'Plan saved.', plans.reload)} />)}
        <Card className="flex flex-col gap-2 sm:flex-row sm:items-end"><div className="flex-1"><label className={labelCls} htmlFor="pn">New plan name</label><Input id="pn" value={n} maxLength={60} onChange={e => setN(e.target.value)} /></div>
          <div><label className={labelCls} htmlFor="pd">Days</label><Input id="pd" className="sm:w-24" inputMode="numeric" value={d} onChange={e => setD(e.target.value.replace(/\D/g, '').slice(0, 2))} /></div>
          <div><label className={labelCls} htmlFor="pp">Price (₹)</label><Input id="pp" className="sm:w-28" inputMode="decimal" value={p} onChange={e => setP(e.target.value.replace(/[^\d.]/g, '').slice(0, 7))} /></div>
          <Button disabled={n.trim().length < 2 || !Number(d) || p === ''} onClick={() => call('POST', '/api/admin/campus/plans', { name: n, duration_days: Number(d), price: Number(p) }, 'Plan added.', () => { setN(''); setP(''); plans.reload(); })}>Add plan</Button></Card></div>}</Wrap></section>
    <section><h2 className="mb-2 text-sm font-semibold text-navy-900">Promotion requests</h2>
      <Wrap err={promos.err} data={promos.data} reload={promos.reload}>{promos.data && (promos.data.items.length === 0 ? <p className="py-6 text-center text-sm text-slate-500">No promotion requests yet.</p> : <div className="space-y-2">{promos.data.items.map(x => (
        <Card key={x.id} className="flex flex-col gap-3 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><p className="font-semibold text-navy-900">{x.product_title || 'Deleted listing'}</p><p className="text-sm text-slate-600">{x.plan} · {inr(x.amount) || '₹0'}{x.end_date ? ` · ends ${new Date(x.end_date).toLocaleDateString('en-IN')}` : ''}</p>
          <div className="mt-1 flex gap-2"><Badge tone={x.status === 'active' ? 'success' : x.status === 'pending' ? 'warning' : 'neutral'} className="capitalize">{x.status}</Badge><Badge className="capitalize">{x.payment_status}</Badge></div></div>
          <div className="flex flex-wrap gap-2">{x.status === 'pending' && x.payment_status === 'unpaid' && <><Button size="sm" onClick={() => call('PATCH', '/api/admin/campus/promotions', { id: x.id, action: 'mark_paid' }, 'Marked as paid.', promos.reload)}>Mark paid</Button><Button size="sm" variant="outline" onClick={() => call('PATCH', '/api/admin/campus/promotions', { id: x.id, action: 'waive' }, 'Fee waived.', promos.reload)}>Waive fee</Button></>}
            {x.status === 'pending' && x.payment_status !== 'unpaid' && <Button size="sm" onClick={() => call('PATCH', '/api/admin/campus/promotions', { id: x.id, action: 'activate' }, 'Promotion is live.', promos.reload)}>Activate</Button>}
            {['pending', 'active'].includes(x.status) && <Button size="sm" variant="outline" className="text-rose-600" onClick={() => call('PATCH', '/api/admin/campus/promotions', { id: x.id, action: 'cancel' }, 'Promotion cancelled.', promos.reload)}>Cancel</Button>}</div></Card>))}</div>)}</Wrap></section></div>);
}
function PlanRow({ pl, save }: { pl: any; save: (b: unknown) => void }) {
  const [name, setName] = useState(pl.name); const [days, setDays] = useState(String(pl.duration_days)); const [price, setPrice] = useState(String(pl.price));
  return <Card className="flex flex-col gap-2 sm:flex-row sm:items-center"><Input className="sm:max-w-[14rem]" value={name} maxLength={60} onChange={e => setName(e.target.value)} aria-label="Plan name" />
    <Input className="sm:w-24" inputMode="numeric" value={days} onChange={e => setDays(e.target.value.replace(/\D/g, '').slice(0, 2))} aria-label="Days" /><Input className="sm:w-28" inputMode="decimal" value={price} onChange={e => setPrice(e.target.value.replace(/[^\d.]/g, '').slice(0, 7))} aria-label="Price" />
    <Toggle label="Active" checked={pl.is_active} onChange={v => save({ id: pl.id, is_active: v })} /><Button size="sm" className="sm:ml-auto" onClick={() => save({ id: pl.id, name, duration_days: Number(days), price: Number(price) })}>Save</Button></Card>;
}

function Settings() {
  const { data, err, reload } = useRes<{ settings: Record<string, any> }>('settings'); const [f, setF] = useState<any>(null);
  useEffect(() => { if (data) setF({ require_moderation: !!data.settings.require_moderation, commission_rate_percent: String(data.settings.commission_rate_percent ?? 0), max_active_listings_per_user: String(data.settings.max_active_listings_per_user ?? 30) }); }, [data]);
  async function save() { const r = await api('/api/admin/campus/settings', 'PUT', { require_moderation: f.require_moderation, commission_rate_percent: Number(f.commission_rate_percent), max_active_listings_per_user: Number(f.max_active_listings_per_user) }); r.ok ? toast('Settings saved.') : toast(r.error ?? 'Failed.', 'error'); }
  return <Wrap err={err} data={f} reload={reload}>{f && <Card className="max-w-xl space-y-4">
    <div><Toggle label="Require approval for new listings (moderation)" checked={f.require_moderation} onChange={v => setF({ ...f, require_moderation: v })} /><p className="mt-1 text-xs text-slate-500">When on, new and re-activated listings stay “pending” until you approve them in Listings.</p></div>
    <div><label className={labelCls} htmlFor="cr">Commission rate (%)</label><Input id="cr" inputMode="decimal" value={f.commission_rate_percent} onChange={e => setF({ ...f, commission_rate_percent: e.target.value.replace(/[^\d.]/g, '').slice(0, 5) })} />
      <p className="mt-1 text-xs text-slate-500">0 = commission off (default). Even when set, commission is only calculated for transactions confirmed through a supported payment workflow — none is connected yet, so nothing is charged for listing or for accepted offers.</p></div>
    <div><label className={labelCls} htmlFor="ml">Max live listings per user</label><Input id="ml" inputMode="numeric" value={f.max_active_listings_per_user} onChange={e => setF({ ...f, max_active_listings_per_user: e.target.value.replace(/\D/g, '').slice(0, 3) })} /></div>
    <Button onClick={save}>Save settings</Button></Card>}</Wrap>;
}
