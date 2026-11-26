'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Navbar } from '@/components/Navbar';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/utils';
import { CONDITIONS, CONTACT_METHODS } from '@/lib/campus/constants';
import { ImageUploader, type Img } from '@/components/campus/ImageUploader';
import { CollegePicker } from '@/components/campus/CollegePicker';
import { Skeleton, api, toast, selectCls, labelCls } from '@/components/campus/ui';
import { useCategories, useMe } from '@/components/campus/hooks';
import { imageUrl } from '@/lib/campus/format';

const empty = { title: '', description: '', categoryId: '', sellingPrice: '', originalPrice: '', condition: 'good', priceType: 'negotiable', collegeName: '', collegeLocation: '', city: '', state: '',
  contactMethod: 'chat_and_offers', pickupAvailable: true, meetOnCampus: false, deliveryAvailable: false };

export default function SellClient() {
  const router = useRouter(); const editId = useSearchParams().get('edit');
  const cats = useCategories(); const { me, loading: meLoading } = useMe();
  const [f, setF] = useState(empty); const [images, setImages] = useState<Img[]>([]); const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<Record<string, string>>({}); const [loading, setLoading] = useState(!!editId);
  const set = (k: keyof typeof empty, v: any) => { setF(p => ({ ...p, [k]: v })); setErr(e => ({ ...e, [k]: '' })); };

  useEffect(() => { // prefill from the user's declared college (convenience only; never treated as verified)
    if (!editId && me?.college) setF(p => ({ ...p, collegeName: p.collegeName || me.college!.name, city: p.city || me.college!.city, state: p.state || me.college!.state || '' }));
  }, [me, editId]);
  useEffect(() => {
    if (!editId) return;
    api<{ product: any }>(`/api/campus/products/${editId}`).then(r => {
      if (!r.ok || !r.data.product.is_owner) { toast('Listing not found.', 'error'); return router.replace('/campus/dashboard'); }
      const p = r.data.product;
      setF({ title: p.title, description: p.description, categoryId: p.category?.id ?? '', sellingPrice: String(p.selling_price), originalPrice: p.original_price ? String(p.original_price) : '', condition: p.condition, priceType: p.price_type,
        collegeName: p.college_name, collegeLocation: p.college_location ?? '', city: p.city, state: p.state ?? '', contactMethod: p.contact_method, pickupAvailable: p.pickup_available, meetOnCampus: p.meet_on_campus, deliveryAvailable: p.delivery_available });
      setImages((p.image_paths as string[]).map(path => ({ path, url: imageUrl(path) }))); setLoading(false);
    });
  }, [editId, router]);

  function validate() {
    const e: Record<string, string> = {}; const sell = Number(f.sellingPrice); const orig = f.originalPrice ? Number(f.originalPrice) : null;
    if (f.title.trim().length < 3) e.title = 'Title must be at least 3 characters.';
    if (!f.categoryId) e.categoryId = 'Choose a category.';
    if (f.description.trim().length < 10) e.description = 'Describe the item in at least 10 characters.';
    if (!images.length) e.images = 'Add at least one photo.';
    if (!f.sellingPrice || !(sell >= 0)) e.sellingPrice = 'Enter the selling price.';
    if (orig !== null && orig < sell) e.originalPrice = 'Original price cannot be lower than the selling price.';
    if (f.collegeName.trim().length < 2) e.collegeName = 'Enter your college.';
    if (f.city.trim().length < 2) e.city = 'Enter the city.';
    if (!f.pickupAvailable && !f.meetOnCampus && !f.deliveryAvailable) e.pickupAvailable = 'Choose at least one handover option.';
    setErr(e); return Object.keys(e).length === 0;
  }
  async function submit(ev: React.FormEvent) {
    ev.preventDefault(); if (!validate()) return toast('Please fix the highlighted fields.', 'error');
    setBusy(true);
    const data = { title: f.title, description: f.description, categoryId: f.categoryId, sellingPrice: Number(f.sellingPrice), originalPrice: f.originalPrice ? Number(f.originalPrice) : null, condition: f.condition, priceType: f.priceType,
      collegeName: f.collegeName, collegeLocation: f.collegeLocation, city: f.city, state: f.state, contactMethod: f.contactMethod, pickupAvailable: f.pickupAvailable, meetOnCampus: f.meetOnCampus, deliveryAvailable: f.deliveryAvailable, images: images.map(i => i.path) };
    const r = editId ? await api(`/api/campus/products/${editId}`, 'PATCH', { action: 'edit', data }) : await api<{ id: string; status: string }>('/api/campus/products', 'POST', data);
    setBusy(false);
    if (r.status === 401) return (window.location.href = `/login?redirectTo=${encodeURIComponent('/campus/sell')}`);
    if (!r.ok) return toast(r.error ?? 'Could not save your listing.', 'error');
    toast(editId ? 'Changes saved.' : r.data.status === 'pending' ? 'Submitted! Your listing will appear once it is reviewed.' : 'Your listing is live!');
    router.push(editId ? `/campus/product/${editId}` : r.data.status === 'pending' ? '/campus/dashboard' : `/campus/product/${r.data.id}`);
  }
  const E = ({ k }: { k: string }) => (err[k] ? <p className="mt-1 text-xs text-rose-600" role="alert">{err[k]}</p> : null);
  const inv = (k: string) => (err[k] ? 'border-rose-300' : '');

  if (loading || meLoading) return (<div><Navbar authed /><div className="container-page max-w-2xl space-y-4 py-8"><Skeleton className="h-8 w-48" /><Skeleton className="h-64 w-full" /></div></div>);
  if (me?.suspended) return (<div><Navbar authed /><div className="container-page max-w-xl py-16 text-center"><h1 className="text-xl font-bold text-navy-900">Selling is unavailable</h1><p className="mt-2 text-sm text-slate-600">Your Campus Marketplace access is suspended. Contact support if you think this is a mistake.</p></div></div>);

  return (
    <div className="pb-24 lg:pb-0">
      <Navbar authed />
      <form onSubmit={submit} noValidate className="container-page max-w-2xl py-6">
        <nav className="text-xs text-slate-500"><Link href="/campus" className="hover:text-brand-blue">Campus Marketplace</Link> / {editId ? 'Edit listing' : 'Sell'}</nav>
        <h1 className="mt-1 text-2xl font-bold text-navy-900">{editId ? 'Edit your listing' : 'Sell Your Product'}</h1>
        <p className="mt-1 text-sm text-slate-500">Buyers contact you through in-app chat. Your phone number and email are never shown. Don’t put contact details in the listing text.</p>

        <div className="mt-6 space-y-5 rounded-xl2 border border-slate-100 bg-white p-4 shadow-soft sm:p-6">
          <div><label className={labelCls}>Photos *</label><ImageUploader value={images} onChange={v => { setImages(v); setErr(e => ({ ...e, images: '' })); }} /><E k="images" /></div>
          <div><label className={labelCls} htmlFor="s-title">Product title *</label><Input id="s-title" className={inv('title')} value={f.title} maxLength={120} onChange={e => set('title', e.target.value)} placeholder="e.g. Casio fx-991EX scientific calculator" /><E k="title" /></div>
          <div><label className={labelCls} htmlFor="s-cat">Category *</label>
            <select id="s-cat" className={cn(selectCls, inv('categoryId'))} value={f.categoryId} onChange={e => set('categoryId', e.target.value)}><option value="">Select a category</option>{cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select><E k="categoryId" /></div>
          <div><label className={labelCls} htmlFor="s-desc">Description *</label>
            <textarea id="s-desc" rows={5} maxLength={2000} value={f.description} onChange={e => set('description', e.target.value)} placeholder="Edition, age, defects, what’s included…" className={cn('w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20', inv('description'))} />
            <div className="flex justify-between"><E k="description" /><span className="ml-auto text-xs text-slate-400">{f.description.length}/2000</span></div></div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className={labelCls} htmlFor="s-sell">Selling price (₹) *</label><Input id="s-sell" inputMode="decimal" className={inv('sellingPrice')} value={f.sellingPrice} onChange={e => set('sellingPrice', e.target.value.replace(/[^\d.]/g, '').slice(0, 9))} /><E k="sellingPrice" /></div>
            <div><label className={labelCls} htmlFor="s-orig">Original price (₹) <span className="font-normal text-slate-400">optional</span></label><Input id="s-orig" inputMode="decimal" className={inv('originalPrice')} value={f.originalPrice} onChange={e => set('originalPrice', e.target.value.replace(/[^\d.]/g, '').slice(0, 9))} /><E k="originalPrice" /></div>
          </div>

          <fieldset><legend className={labelCls}>Condition *</legend><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{CONDITIONS.map(c => (
            <label key={c.value} className={cn('cursor-pointer rounded-xl border px-3 py-2.5 text-center text-sm font-medium', f.condition === c.value ? 'border-brand-blue bg-brand-blue/10 text-brand-bluedark' : 'border-slate-200 text-navy-900 hover:border-brand-blue')}>
              <input type="radio" name="cond" className="sr-only" checked={f.condition === c.value} onChange={() => set('condition', c.value)} />{c.label}</label>))}</div></fieldset>
          <fieldset><legend className={labelCls}>Price type *</legend><div className="grid grid-cols-2 gap-2">{(['negotiable', 'fixed'] as const).map(v => (
            <label key={v} className={cn('cursor-pointer rounded-xl border px-3 py-2.5 text-center text-sm font-medium capitalize', f.priceType === v ? 'border-brand-blue bg-brand-blue/10 text-brand-bluedark' : 'border-slate-200 text-navy-900 hover:border-brand-blue')}>
              <input type="radio" name="pt" className="sr-only" checked={f.priceType === v} onChange={() => set('priceType', v)} />{v}</label>))}</div>
            {f.priceType === 'fixed' && <p className="mt-1 text-xs text-slate-500">Buyers won’t be able to send price offers on fixed-price listings.</p>}</fieldset>

          <div className="space-y-4 rounded-xl bg-slate-50 p-4">
            <div><label className={labelCls} htmlFor="s-col">College name *</label>
              <CollegePicker id="s-col" value={f.collegeName} onChange={(n, c) => { set('collegeName', n); if (c) setF(p => ({ ...p, collegeName: n, city: c.city, state: c.state ?? p.state })); }} />
              <p className="mt-1 text-xs text-slate-500">Choosing a college doesn’t make you a member of it — the “Verified student” badge is only given after our team verifies you.</p><E k="collegeName" /></div>
            <div><label className={labelCls} htmlFor="s-loc">College location / campus <span className="font-normal text-slate-400">optional</span></label><Input id="s-loc" value={f.collegeLocation} maxLength={160} onChange={e => set('collegeLocation', e.target.value)} placeholder="e.g. Gachibowli campus, Block C" /></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><label className={labelCls} htmlFor="s-city">City *</label><Input id="s-city" className={inv('city')} value={f.city} maxLength={80} onChange={e => set('city', e.target.value)} /><E k="city" /></div>
              <div><label className={labelCls} htmlFor="s-state">State</label><Input id="s-state" value={f.state} maxLength={80} onChange={e => set('state', e.target.value)} /></div></div>
          </div>

          <div><label className={labelCls} htmlFor="s-contact">Preferred contact method *</label>
            <select id="s-contact" className={selectCls} value={f.contactMethod} onChange={e => set('contactMethod', e.target.value)}>{CONTACT_METHODS.map(c => <option key={c.value} value={c.value}>{c.label} (in-app)</option>)}</select></div>
          <fieldset><legend className={labelCls}>Handover *</legend><div className="space-y-2 text-sm text-navy-900">
            {([['pickupAvailable', 'Available for pickup'], ['meetOnCampus', 'Can meet at college campus'], ['deliveryAvailable', 'Delivery available (you arrange it)']] as const).map(([k, l]) => (
              <label key={k} className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-[#FF7A00]" checked={f[k]} onChange={e => set(k, e.target.checked)} />{l}</label>))}</div><E k="pickupAvailable" /></fieldset>
        </div>

        <div className="fixed inset-x-0 bottom-16 z-20 border-t border-slate-100 bg-white/95 p-3 backdrop-blur lg:static lg:mt-5 lg:border-0 lg:bg-transparent lg:p-0">
          <div className="mx-auto flex max-w-2xl gap-3"><Link href="/campus" className="flex-1 lg:flex-none"><Button type="button" variant="outline" className="w-full">Cancel</Button></Link>
            <Button type="submit" size="lg" disabled={busy} className="flex-1">{busy ? 'Saving…' : editId ? 'Save changes' : 'Publish listing'}</Button></div></div>
      </form>
      <MobileBottomNav />
    </div>
  );
}
