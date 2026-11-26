'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Send } from 'lucide-react';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';
import { inr, timeAgo } from '@/lib/campus/format';
import { Skeleton, ErrorState, api, toast } from './ui';

interface Conv { id: string; role: 'buyer' | 'seller'; other_name: string; product: { id: string; title: string; image: string | null; status: string; price: number } | null; last_message: string; last_at: string; unread: number }
interface Thread { role: string; other_name: string; product: Conv['product']; messages: { id: string; mine: boolean; message: string; created_at: string }[]; offers: { id: string; offered_price: number; status: string }[] }

export function Inbox({ openId, onOpen }: { openId: string | null; onOpen: (id: string | null) => void }) {
  const [list, setList] = useState<Conv[] | null>(null); const [err, setErr] = useState<string | null>(null);
  const loadList = useCallback(() => api<{ items: Conv[] }>('/api/campus/conversations').then(r => (r.ok ? setList(r.data.items) : setErr(r.error ?? 'Could not load messages.'))), []);
  useEffect(() => { loadList(); }, [loadList, openId]);
  if (err) return <ErrorState message={err} onRetry={() => { setErr(null); loadList(); }} />;
  if (!list) return <div className="space-y-2"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>;
  if (!list.length) return <EmptyState title="No conversations yet." subtitle="Messages from buyers and sellers appear here. Use “Contact Seller” on a listing to start one." />;
  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <ul className={cn('space-y-2', openId && 'hidden lg:block')}>
        {list.map(c => (
          <li key={c.id}><button onClick={() => onOpen(c.id)} className={cn('flex w-full gap-3 rounded-xl border p-3 text-left transition hover:border-brand-blue', openId === c.id ? 'border-brand-blue bg-brand-blue/5' : 'border-slate-100 bg-white')}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {c.product?.image ? <img src={c.product.image} alt="" loading="lazy" className="h-12 w-12 shrink-0 rounded-lg object-cover" /> : <div className="h-12 w-12 shrink-0 rounded-lg bg-slate-100" />}
            <div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><p className="truncate text-sm font-semibold text-navy-900">{c.product?.title ?? 'Listing removed'}</p>{c.unread > 0 && <span className="rounded-full bg-brand-blue px-1.5 text-[11px] font-bold text-white">{c.unread}</span>}</div>
              <p className="truncate text-xs text-slate-500">{c.role === 'buyer' ? 'Seller' : 'Buyer'}: {c.other_name} · {timeAgo(c.last_at)}</p><p className="truncate text-xs text-slate-600">{c.last_message}</p></div></button></li>))}
      </ul>
      <div className={cn(!openId && 'hidden lg:block')}>{openId ? <ThreadView id={openId} onBack={() => onOpen(null)} onSent={loadList} /> : <div className="hidden rounded-xl2 border border-dashed border-slate-200 p-10 text-center text-sm text-slate-500 lg:block">Select a conversation</div>}</div>
    </div>
  );
}

function ThreadView({ id, onBack, onSent }: { id: string; onBack: () => void; onSent: () => void }) {
  const [t, setT] = useState<Thread | null>(null); const [miss, setMiss] = useState(false); const [text, setText] = useState(''); const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const load = useCallback(async () => { const r = await api<Thread>(`/api/campus/conversations/${id}`); if (r.ok) setT(r.data); else setMiss(true); }, [id]);
  useEffect(() => { setT(null); setMiss(false); load(); const i = setInterval(load, 15000); return () => clearInterval(i); }, [load]);   // light polling; no realtime dependency
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [t?.messages.length]);
  async function send(e: React.FormEvent) {
    e.preventDefault(); if (!text.trim()) return; setBusy(true);
    const r = await api(`/api/campus/conversations/${id}`, 'POST', { message: text }); setBusy(false);
    if (!r.ok) return toast(r.error ?? 'Could not send.', 'error'); setText(''); await load(); onSent();
  }
  if (miss) return <EmptyState title="Conversation not found." />;
  if (!t) return <Skeleton className="h-80 w-full" />;
  return (
    <div className="flex h-[70vh] flex-col overflow-hidden rounded-xl2 border border-slate-100 bg-white">
      <div className="flex items-center gap-3 border-b border-slate-100 p-3">
        <button onClick={onBack} className="rounded-full p-1.5 hover:bg-slate-100 lg:hidden" aria-label="Back"><ArrowLeft className="h-5 w-5" /></button>
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-navy-900">{t.product?.title ?? 'Listing removed'}</p><p className="text-xs text-slate-500">{t.role === 'buyer' ? 'Seller' : 'Buyer'}: {t.other_name}{t.product ? ` · ${inr(t.product.price)}` : ''}</p></div>
        {t.product && <Link href={`/campus/product/${t.product.id}`} className="text-xs font-semibold text-brand-blue">View listing</Link>}
      </div>
      {t.offers[0] && <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-600">Latest offer {inr(t.offers[0].offered_price)} <Badge className="capitalize">{t.offers[0].status}</Badge>{t.role === 'seller' && <Link href="/campus/dashboard?tab=offers" className="ml-auto font-semibold text-brand-blue">Manage offers</Link>}</div>}
      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {t.messages.map(m => (<div key={m.id} className={cn('flex', m.mine ? 'justify-end' : 'justify-start')}><div className={cn('max-w-[80%] whitespace-pre-line break-words rounded-2xl px-3 py-2 text-sm', m.mine ? 'bg-brand-blue text-white' : 'bg-slate-100 text-navy-900')}>{m.message}<span className={cn('mt-1 block text-[10px]', m.mine ? 'text-white/70' : 'text-slate-400')}>{timeAgo(m.created_at)}</span></div></div>))}
        <div ref={end} />
      </div>
      <form onSubmit={send} className="flex gap-2 border-t border-slate-100 p-3">
        <input value={text} onChange={e => setText(e.target.value)} maxLength={1000} placeholder="Write a message…" aria-label="Message" className="min-h-[44px] flex-1 rounded-full border border-slate-200 px-4 text-sm outline-none focus:border-brand-blue" />
        <Button type="submit" disabled={busy || !text.trim()} aria-label="Send"><Send className="h-4 w-4" /></Button>
      </form>
    </div>
  );
}
