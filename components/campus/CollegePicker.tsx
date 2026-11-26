'use client';
import { useEffect, useRef, useState } from 'react';
import { Search, GraduationCap } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { api } from './ui';

export interface College { name: string; city: string; state: string | null }
// Searchable (debounced, server-side) college combobox. Free text is allowed: if a college isn't listed, the
// typed name is used and added to the list for others. Choosing a college never makes anyone a member of it.
export function CollegePicker({ value, onChange, placeholder = 'Search your college…', id }: { value: string; onChange: (name: string, c?: College) => void; placeholder?: string; id?: string }) {
  const [q, setQ] = useState(value); const [items, setItems] = useState<College[]>([]); const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null); const seq = useRef(0);
  useEffect(() => setQ(value), [value]);
  useEffect(() => {
    if (!open) return; const n = ++seq.current;
    const t = setTimeout(async () => { const r = await api<{ colleges: College[] }>(`/api/campus/colleges?q=${encodeURIComponent(q)}`); if (n === seq.current && r.ok) setItems(r.data.colleges); }, 250);
    return () => clearTimeout(t);
  }, [q, open]);
  useEffect(() => { const h = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false); document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h); }, []);
  return (
    <div ref={box} className="relative">
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <Input id={id} value={q} maxLength={160} autoComplete="off" role="combobox" aria-expanded={open} placeholder={placeholder} className="pl-10"
        onFocus={() => setOpen(true)} onChange={e => { setQ(e.target.value); setOpen(true); onChange(e.target.value); }} />
      {open && (
        <ul className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-soft" role="listbox">
          {items.map(c => (
            <li key={`${c.name}|${c.city}`}><button type="button" role="option" aria-selected={false} className="flex w-full items-start gap-2 px-3 py-2.5 text-left text-sm hover:bg-slate-50"
              onClick={() => { setQ(c.name); onChange(c.name, c); setOpen(false); }}>
              <GraduationCap className="mt-0.5 h-4 w-4 shrink-0 text-brand-blue" /><span><span className="block font-medium text-navy-900">{c.name}</span><span className="text-xs text-slate-500">{c.city}{c.state ? `, ${c.state}` : ''}</span></span></button></li>))}
          {!items.length && <li className="px-3 py-3 text-sm text-slate-500">{q.trim() ? 'Not listed? Keep typing the full name and we’ll add it.' : 'Start typing a college name'}</li>}
        </ul>
      )}
    </div>
  );
}
