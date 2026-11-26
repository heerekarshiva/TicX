'use client';
import { useEffect, useState } from 'react';
import { X, CheckCircle2, AlertCircle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';

// ---------- API helper ----------
export interface ApiResult<T = any> { ok: boolean; status: number; data: T; error?: string }
export async function api<T = any>(url: string, method = 'GET', body?: unknown): Promise<ApiResult<T>> {
  try {
    const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
    const r = await fetch(url, { method, headers: body && !isForm ? { 'Content-Type': 'application/json' } : undefined, body: isForm ? (body as FormData) : body ? JSON.stringify(body) : undefined });
    const data = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, data, error: (data as any)?.error };
  } catch { return { ok: false, status: 0, data: {} as T, error: 'Network error. Check your connection and try again.' }; }
}
export function goLogin() {
  window.location.href = `/login?redirectTo=${encodeURIComponent(window.location.pathname + window.location.search)}`;
}
export const selectCls = 'min-h-[44px] w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-navy-900 outline-none transition focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20';
export const labelCls = 'mb-1.5 block text-sm font-medium text-navy-900';

// ---------- toasts (module-level so any component can call toast() without a provider) ----------
type T = { id: number; msg: string; kind: 'success' | 'error' | 'info' };
const listeners = new Set<(t: T) => void>(); let seq = 0;
export const toast = (msg: string, kind: T['kind'] = 'success') => listeners.forEach(l => l({ id: ++seq, msg, kind }));
export function Toaster() {
  const [items, setItems] = useState<T[]>([]);
  useEffect(() => {
    const l = (t: T) => { setItems(p => [...p, t]); setTimeout(() => setItems(p => p.filter(x => x.id !== t.id)), 4500); };
    listeners.add(l); return () => { listeners.delete(l); };
  }, []);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-20 z-[60] flex flex-col items-center gap-2 px-4" role="status" aria-live="polite">
      {items.map(t => (
        <div key={t.id} className={cn('pointer-events-auto flex max-w-md items-start gap-2 rounded-xl border bg-white px-4 py-3 text-sm shadow-soft', t.kind === 'error' ? 'border-rose-200 text-rose-800' : t.kind === 'info' ? 'border-slate-200 text-navy-900' : 'border-emerald-200 text-emerald-800')}>
          {t.kind === 'error' ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> : t.kind === 'info' ? <Info className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
          <span>{t.msg}</span>
        </div>
      ))}
    </div>
  );
}

// ---------- modal + confirm ----------
export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', k); document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', k); document.body.style.overflow = ''; };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy-900/50 p-0 sm:items-center sm:p-4" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-soft sm:max-w-md sm:rounded-2xl">
        <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-bold text-navy-900">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button></div>
        {children}
      </div>
    </div>
  );
}
export function ConfirmDialog({ open, title, body, confirmLabel = 'Confirm', danger, busy, onConfirm, onCancel }:
  { open: boolean; title: string; body: string; confirmLabel?: string; danger?: boolean; busy?: boolean; onConfirm: () => void; onCancel: () => void }) {
  return (
    <Modal open={open} onClose={onCancel} title={title}>
      <p className="text-sm text-slate-600">{body}</p>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button onClick={onConfirm} disabled={busy} className={danger ? '!bg-rose-600 !bg-none hover:!bg-rose-700' : ''}>{busy ? 'Working…' : confirmLabel}</Button>
      </div>
    </Modal>
  );
}

// ---------- skeletons / states ----------
export const Skeleton = ({ className }: { className?: string }) => <div className={cn('animate-pulse rounded-lg bg-slate-100', className)} />;
export function ProductGridSkeleton({ n = 8 }: { n?: number }) {
  return (<div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4" aria-busy="true">
    {Array.from({ length: n }).map((_, i) => (
      <div key={i} className="overflow-hidden rounded-xl2 border border-slate-100 bg-white"><Skeleton className="aspect-[4/3] w-full rounded-none" />
        <div className="space-y-2 p-3"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-5 w-1/3" /><Skeleton className="h-3 w-1/2" /></div></div>))}
  </div>);
}
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (<div className="flex flex-col items-center gap-3 rounded-xl2 border border-rose-100 bg-rose-50/50 py-12 text-center">
    <AlertCircle className="h-6 w-6 text-rose-500" /><p className="max-w-sm text-sm text-rose-800">{message}</p>
    {onRetry && <Button variant="outline" size="sm" onClick={onRetry}>Try again</Button>}</div>);
}
