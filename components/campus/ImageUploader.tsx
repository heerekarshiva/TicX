'use client';
import { useRef, useState } from 'react';
import { ImagePlus, X, Loader2 } from 'lucide-react';
import { MAX_IMAGES } from '@/lib/campus/constants';
import { api, toast } from './ui';

export interface Img { path: string; url: string }

// Compresses in the browser (max 1280px, WebP/JPEG) BEFORE upload: smaller files, faster pages, EXIF/GPS metadata
// stripped as a side effect of re-encoding. The server still validates magic bytes and size independently.
async function compress(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height); bmp.close?.();
  const toBlob = (t: string, q: number) => new Promise<Blob | null>(r => c.toBlob(r, t, q));
  let b = await toBlob('image/webp', 0.82);
  if (!b || b.type !== 'image/webp') b = await toBlob('image/jpeg', 0.85);
  if (!b) throw new Error('compress');
  return b;
}

export function ImageUploader({ value, onChange }: { value: Img[]; onChange: (v: Img[]) => void }) {
  const input = useRef<HTMLInputElement>(null); const [busy, setBusy] = useState(0);
  async function add(files: FileList | null) {
    if (!files) return;
    const room = MAX_IMAGES - value.length; const picked = Array.from(files).slice(0, room);
    if (files.length > room) toast(`You can add up to ${MAX_IMAGES} photos.`, 'info');
    let next = [...value]; setBusy(b => b + picked.length);
    await Promise.all(picked.map(async f => {
      try {
        if (!/^image\/(jpeg|png|webp)$/.test(f.type)) { toast(`${f.name}: only JPG, PNG or WEBP images are allowed.`, 'error'); return; }
        const blob = await compress(f); const fd = new FormData(); fd.append('file', blob, 'photo');
        const r = await api<{ path: string; url: string }>('/api/campus/upload', 'POST', fd);
        if (!r.ok) { toast(r.error ?? 'Upload failed.', 'error'); return; }
        next = [...next, { path: r.data.path, url: r.data.url }]; onChange(next);
      } catch { toast(`${f.name}: could not process this image.`, 'error'); }
      finally { setBusy(b => b - 1); }
    }));
    if (input.current) input.current.value = '';
  }
  return (
    <div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {value.map((im, i) => (
          <div key={im.path} className="group relative aspect-square overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={im.url} alt={`Photo ${i + 1}`} className="h-full w-full object-cover" loading="lazy" />
            {i === 0 && <span className="absolute left-1 top-1 rounded bg-navy-900/80 px-1.5 py-0.5 text-[10px] font-medium text-white">Cover</span>}
            <button type="button" aria-label={`Remove photo ${i + 1}`} onClick={() => onChange(value.filter(v => v.path !== im.path))} className="absolute right-1 top-1 rounded-full bg-white/95 p-1 text-slate-700 shadow hover:bg-white"><X className="h-3.5 w-3.5" /></button>
          </div>))}
        {Array.from({ length: busy }).map((_, i) => <div key={`b${i}`} className="flex aspect-square items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>)}
        {value.length + busy < MAX_IMAGES && (
          <button type="button" onClick={() => input.current?.click()} className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-300 text-xs font-medium text-slate-500 transition hover:border-brand-blue hover:text-brand-blue">
            <ImagePlus className="h-5 w-5" />Add photo</button>)}
      </div>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={e => add(e.target.files)} />
      <p className="mt-2 text-xs text-slate-500">Up to {MAX_IMAGES} photos · JPG, PNG or WEBP · compressed automatically. The first photo is the cover.</p>
    </div>
  );
}
