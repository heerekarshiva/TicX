'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { BadgeCheck, Heart, Flag, MessageCircle, Tag, MapPin, Calendar, Eye, ShieldAlert, Pencil, Star, Handshake, Truck, Store } from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/utils';
import { conditionLabel, REPORT_REASONS, LISTING_STATUS_TONE } from '@/lib/campus/constants';
import { inr, timeAgo, discountPct } from '@/lib/campus/format';
import { Modal, Skeleton, api, goLogin, toast, selectCls, labelCls } from '@/components/campus/ui';

interface P {
  id: string; title: string; description: string; selling_price: number; original_price: number | null; condition: string; price_type: 'fixed' | 'negotiable';
  college_name: string; college_location: string | null; city: string; state: string | null; images: string[]; status: string; created_at: string; featured: boolean;
  category: { name: string; slug: string } | null; contact_method: string; pickup_available: boolean; meet_on_campus: boolean; delivery_available: boolean;
  views_count: number; is_owner: boolean; seller: { name: string; verified: boolean; active_listings: number }; seller_member_since: string | null; seller_college: string | null;
}
interface Viewer { wishlisted: boolean; openOffer: { id: string; offered_price: number; status: string } | null; conversationId: string | null }

export default function ProductClient({ id }: { id: string }) {
  const [p, setP] = useState<P | null>(null); const [viewer, setViewer] = useState<Viewer | null>(null); const [signedIn, setSignedIn] = useState(false);
  const [state, setState] = useState<'loading' | 'ok' | 'missing'>('loading'); const [img, setImg] = useState(0);
  const [modal, setModal] = useState<null | 'contact' | 'offer' | 'report'>(null);
  const load = useCallback(async () => {
    const r = await api<{ product: P; viewer: Viewer | null; signedIn: boolean }>(`/api/campus/products/${id}`);
    if (!r.ok) return setState('missing');
    setP(r.data.product); setViewer(r.data.viewer); setSignedIn(r.data.signedIn); setState('ok');
  }, [id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (state === 'ok') api(`/api/campus/products/${id}/view`, 'POST'); }, [state, id]);

  const need = (fn: () => void) => () => (signedIn ? fn() : goLogin());
  async function toggleWish() {
    const r = await api<{ saved: boolean }>('/api/campus/wishlist', 'POST', { productId: id });
    if (!r.ok) return toast(r.error ?? 'Could not update wishlist.', 'error');
    setViewer(v => ({ ...(v ?? { openOffer: null, conversationId: null }), wishlisted: r.data.saved })); toast(r.data.saved ? 'Saved to your wishlist.' : 'Removed from your wishlist.');
  }

  if (state === 'loading') return (<div><Navbar /><div className="container-page grid gap-6 py-8 lg:grid-cols-2"><Skeleton className="aspect-square w-full" /><div className="space-y-3"><Skeleton className="h-8 w-3/4" /><Skeleton className="h-8 w-1/3" /><Skeleton className="h-40 w-full" /></div></div></div>);
  if (state === 'missing' || !p) return (<div><Navbar /><div className="container-page py-16"><EmptyState title="This listing is no longer available." subtitle="It may have been sold, paused or removed." /><div className="mt-4 text-center"><Link href="/campus/browse"><Button>Browse the marketplace</Button></Link></div></div></div>);

  const off = discountPct(p.selling_price, p.original_price); const live = p.status === 'active';
  const canContact = live && !p.is_owner && p.contact_method !== 'offers_only'; const canOffer = live && !p.is_owner && p.contact_method !== 'chat_only' && p.price_type === 'negotiable';
  return (
    <div className="pb-24 lg:pb-0">
      <Navbar />
      <div className="container-page py-6">
        <nav className="text-xs text-slate-500"><Link href="/campus" className="hover:text-brand-blue">Campus Marketplace</Link> / {p.category && <Link href={`/campus/browse?category=${p.category.slug}`} className="hover:text-brand-blue">{p.category.name}</Link>}</nav>
        <div className="mt-4 grid gap-6 lg:grid-cols-[1.1fr_1fr] lg:gap-10">
          <div>
            <div className="relative aspect-square overflow-hidden rounded-xl2 border border-slate-100 bg-slate-100 sm:aspect-[4/3]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.images[img]} alt={`${p.title} – photo ${img + 1}`} className="h-full w-full object-contain" decoding="async" />
              {p.featured && <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-brand-blue px-2.5 py-1 text-xs font-semibold text-white"><Star className="h-3 w-3" />Featured</span>}
            </div>
            {p.images.length > 1 && <div className="mt-3 grid grid-cols-5 gap-2">{p.images.map((u, i) => (
              <button key={u} onClick={() => setImg(i)} aria-label={`Show photo ${i + 1}`} className={cn('aspect-square overflow-hidden rounded-lg border-2', i === img ? 'border-brand-blue' : 'border-transparent opacity-70 hover:opacity-100')}>
                {/* eslint-disable-next-line @next/next/no-img-element */}<img src={u} alt="" loading="lazy" className="h-full w-full object-cover" /></button>))}</div>}
          </div>

          <div>
            {!live && <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">{p.is_owner ? `This listing is ${p.status} and not visible to buyers.` : 'This item is not available.'}</div>}
            <div className="flex flex-wrap items-center gap-2"><Badge tone={LISTING_STATUS_TONE[p.status] ?? 'neutral'} className="capitalize">{p.status === 'active' ? 'Available' : p.status}</Badge><Badge tone={p.condition === 'brand_new' || p.condition === 'like_new' ? 'success' : 'neutral'}>{conditionLabel(p.condition)}</Badge>
              <Badge>{p.price_type === 'negotiable' ? 'Negotiable' : 'Fixed price'}</Badge></div>
            <h1 className="mt-3 text-2xl font-bold leading-tight text-navy-900">{p.title}</h1>
            <div className="mt-3 flex flex-wrap items-baseline gap-3"><span className="text-3xl font-extrabold text-navy-900">{inr(p.selling_price)}</span>
              {p.original_price ? <span className="text-slate-400 line-through">{inr(p.original_price)}</span> : null}{off > 0 && <span className="text-sm font-semibold text-emerald-700">{off}% off</span>}</div>

            <div className="mt-5 flex flex-wrap gap-3">
              {p.is_owner ? (<><Link href={`/campus/sell?edit=${p.id}`}><Button><Pencil className="h-4 w-4" />Edit listing</Button></Link><Link href="/campus/dashboard"><Button variant="outline">Open dashboard</Button></Link></>) : (<>
                {canContact && <Button onClick={need(() => (viewer?.conversationId ? (window.location.href = `/campus/dashboard?tab=messages&c=${viewer.conversationId}`) : setModal('contact')))}><MessageCircle className="h-4 w-4" />{viewer?.conversationId ? 'Open chat' : 'Contact Seller'}</Button>}
                {canOffer && <Button variant="secondary" onClick={need(() => setModal('offer'))} disabled={!!viewer?.openOffer}><Handshake className="h-4 w-4" />{viewer?.openOffer ? `Offer sent (${inr(viewer.openOffer.offered_price)})` : 'Make an Offer'}</Button>}
                <Button variant="outline" onClick={need(toggleWish)}><Heart className={cn('h-4 w-4', viewer?.wishlisted && 'fill-brand-blue text-brand-blue')} />{viewer?.wishlisted ? 'Saved' : 'Save to Wishlist'}</Button>
                <Button variant="ghost" onClick={need(() => setModal('report'))}><Flag className="h-4 w-4" />Report Listing</Button></>)}
            </div>
            {!p.is_owner && live && p.contact_method === 'offers_only' && <p className="mt-2 text-xs text-slate-500">This seller only takes offers.</p>}
            {!p.is_owner && live && p.price_type === 'fixed' && <p className="mt-2 text-xs text-slate-500">Fixed price: offers are turned off for this listing.</p>}

            <dl className="mt-6 grid grid-cols-2 gap-3 text-sm">
              <div className="flex items-start gap-2"><Tag className="mt-0.5 h-4 w-4 text-brand-blue" /><div><dt className="text-xs text-slate-500">Category</dt><dd className="font-medium text-navy-900">{p.category?.name ?? '—'}</dd></div></div>
              <div className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 text-brand-blue" /><div><dt className="text-xs text-slate-500">College</dt><dd className="font-medium text-navy-900">{p.college_name}</dd></div></div>
              <div className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 text-brand-blue" /><div><dt className="text-xs text-slate-500">Location</dt><dd className="font-medium text-navy-900">{[p.college_location, p.city, p.state].filter(Boolean).join(', ')}</dd></div></div>
              <div className="flex items-start gap-2"><Calendar className="mt-0.5 h-4 w-4 text-brand-blue" /><div><dt className="text-xs text-slate-500">Listed</dt><dd className="font-medium text-navy-900">{timeAgo(p.created_at)}</dd></div></div>
            </dl>
            <div className="mt-4 flex flex-wrap gap-2 text-xs">
              {p.pickup_available && <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1.5 text-slate-700"><Store className="h-3.5 w-3.5" />Pickup available</span>}
              {p.meet_on_campus && <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1.5 text-slate-700"><MapPin className="h-3.5 w-3.5" />Meet at campus</span>}
              {p.delivery_available && <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1.5 text-slate-700"><Truck className="h-3.5 w-3.5" />Delivery by seller</span>}
              {p.is_owner && <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1.5 text-slate-700"><Eye className="h-3.5 w-3.5" />{p.views_count} views</span>}
            </div>

            <section className="mt-6"><h2 className="font-semibold text-navy-900">Description</h2><p className="mt-2 whitespace-pre-line break-words text-sm leading-relaxed text-slate-700">{p.description}</p></section>

            <section className="mt-6 rounded-xl2 border border-slate-100 p-4"><h2 className="text-sm font-semibold text-navy-900">Seller</h2>
              <div className="mt-2 flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-blue/10 text-lg font-bold text-brand-blue">{p.seller.name[0]}</span>
                <div className="min-w-0"><p className="flex flex-wrap items-center gap-1 font-medium text-navy-900">{p.seller.name}
                  {p.seller.verified ? <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700"><BadgeCheck className="h-3.5 w-3.5" />Verified student</span> : <span className="text-xs font-normal text-slate-400">Not verified</span>}</p>
                  <p className="text-xs text-slate-500">{p.seller.active_listings} active listing{p.seller.active_listings === 1 ? '' : 's'}{p.seller_member_since ? ` · Member since ${new Date(p.seller_member_since).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}` : ''}{p.seller_college ? ` · ${p.seller_college}` : ''}</p></div></div>
            </section>

            <div className="mt-5 flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /><p>Meet in a public place on campus and check the item before paying. MyTICX does not process payments for Campus Marketplace and does not offer escrow or buyer protection. Never share OTPs or pay in advance.</p></div>
          </div>
        </div>
      </div>
      <ContactModal open={modal === 'contact'} onClose={() => setModal(null)} p={p} onDone={cid => { setModal(null); setViewer(v => ({ ...(v ?? { wishlisted: false, openOffer: null }), conversationId: cid })); }} />
      <OfferModal open={modal === 'offer'} onClose={() => setModal(null)} p={p} onDone={() => { setModal(null); load(); }} />
      <ReportModal open={modal === 'report'} onClose={() => setModal(null)} id={p.id} />
      <MobileBottomNav />
    </div>
  );
}

function ContactModal({ open, onClose, p, onDone }: { open: boolean; onClose: () => void; p: P; onDone: (cid: string) => void }) {
  const [msg, setMsg] = useState(`Hi! Is “${p.title.slice(0, 60)}” still available?`); const [busy, setBusy] = useState(false);
  async function send() {
    setBusy(true); const r = await api<{ conversationId: string }>('/api/campus/conversations', 'POST', { productId: p.id, message: msg }); setBusy(false);
    if (!r.ok) return toast(r.error ?? 'Could not send.', 'error');
    toast('Message sent. Replies appear in your dashboard → Messages.'); onDone(r.data.conversationId);
  }
  return (<Modal open={open} onClose={onClose} title="Contact seller">
    <p className="text-sm text-slate-600">Your message goes through MyTICX. The seller’s phone number and email stay private.</p>
    <textarea value={msg} onChange={e => setMsg(e.target.value)} maxLength={1000} rows={4} aria-label="Message" className="mt-3 w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20" />
    <div className="mt-4 flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={send} disabled={busy || !msg.trim()}>{busy ? 'Sending…' : 'Send message'}</Button></div></Modal>);
}
function OfferModal({ open, onClose, p, onDone }: { open: boolean; onClose: () => void; p: P; onDone: () => void }) {
  const [price, setPrice] = useState(''); const [note, setNote] = useState(''); const [busy, setBusy] = useState(false);
  async function send() {
    setBusy(true); const r = await api('/api/campus/offers', 'POST', { productId: p.id, price: Number(price), message: note || undefined }); setBusy(false);
    if (!r.ok) return toast(r.error ?? 'Could not send the offer.', 'error'); toast('Offer sent. The seller will see it in their dashboard.'); onDone();
  }
  return (<Modal open={open} onClose={onClose} title="Make an offer">
    <p className="text-sm text-slate-600">Asking price: <b>{inr(p.selling_price)}</b>. An accepted offer is not a payment — you and the seller still arrange the handover yourselves.</p>
    <label className={cn(labelCls, 'mt-3')} htmlFor="offer-price">Your offer (₹)</label><Input id="offer-price" inputMode="numeric" value={price} onChange={e => setPrice(e.target.value.replace(/[^\d.]/g, '').slice(0, 9))} placeholder={`Up to ${p.selling_price}`} />
    <label className={cn(labelCls, 'mt-3')} htmlFor="offer-note">Note (optional)</label><Input id="offer-note" value={note} maxLength={500} onChange={e => setNote(e.target.value)} placeholder="e.g. Can pick up today" />
    <div className="mt-4 flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={send} disabled={busy || !Number(price)}>{busy ? 'Sending…' : 'Send offer'}</Button></div></Modal>);
}
function ReportModal({ open, onClose, id }: { open: boolean; onClose: () => void; id: string }) {
  const [reason, setReason] = useState<string>(REPORT_REASONS[0].value); const [details, setDetails] = useState(''); const [busy, setBusy] = useState(false);
  async function send() {
    setBusy(true); const r = await api('/api/campus/reports', 'POST', { productId: id, reason, details: details || undefined }); setBusy(false);
    if (!r.ok) return toast(r.error ?? 'Could not submit the report.', 'error'); toast('Thanks — our team will review this listing.'); onClose();
  }
  return (<Modal open={open} onClose={onClose} title="Report listing">
    <label className={labelCls} htmlFor="rep-reason">Reason</label><select id="rep-reason" className={selectCls} value={reason} onChange={e => setReason(e.target.value)}>{REPORT_REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}</select>
    <label className={cn(labelCls, 'mt-3')} htmlFor="rep-details">Details (optional)</label>
    <textarea id="rep-details" value={details} onChange={e => setDetails(e.target.value)} maxLength={500} rows={3} className="w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20" />
    <div className="mt-4 flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={send} disabled={busy}>{busy ? 'Submitting…' : 'Submit report'}</Button></div></Modal>);
}
