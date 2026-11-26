import Link from 'next/link';
import { BadgeCheck, MapPin, Star } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { conditionLabel } from '@/lib/campus/constants';
import { inr, timeAgo, discountPct } from '@/lib/campus/format';

export interface CardProduct {
  id: string; title: string; selling_price: number; original_price: number | null; condition: string; college_name: string; city: string;
  images: string[]; created_at: string; featured?: boolean; status?: string; seller: { name: string; verified: boolean };
}

export function ProductCard({ p }: { p: CardProduct }) {
  const off = discountPct(p.selling_price, p.original_price);
  return (
    <Link href={`/campus/product/${p.id}`} className="group flex flex-col overflow-hidden rounded-xl2 border border-slate-100 bg-white shadow-soft transition hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue">
      <div className="relative aspect-[4/3] overflow-hidden bg-slate-100">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={p.images[0]} alt={p.title} loading="lazy" decoding="async" className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
        {p.featured && <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-brand-blue px-2 py-1 text-[11px] font-semibold text-white"><Star className="h-3 w-3" />Featured</span>}
        {off > 0 && <span className="absolute right-2 top-2 rounded-full bg-white/95 px-2 py-1 text-[11px] font-semibold text-emerald-700">{off}% off</span>}
        {p.status && p.status !== 'active' && <span className="absolute inset-x-0 bottom-0 bg-navy-900/80 py-1 text-center text-xs font-medium capitalize text-white">{p.status}</span>}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-navy-900">{p.title}</h3>
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-base font-bold text-navy-900">{inr(p.selling_price)}</span>
          {p.original_price ? <span className="text-xs text-slate-400 line-through">{inr(p.original_price)}</span> : null}
        </div>
        <div><Badge tone={p.condition === 'brand_new' || p.condition === 'like_new' ? 'success' : 'neutral'}>{conditionLabel(p.condition)}</Badge></div>
        <p className="flex items-start gap-1 text-xs text-slate-500"><MapPin className="mt-0.5 h-3 w-3 shrink-0" /><span className="line-clamp-1">{p.college_name} · {p.city}</span></p>
        <div className="mt-auto flex items-center justify-between pt-1 text-xs text-slate-500">
          <span className="flex min-w-0 items-center gap-1 truncate">{p.seller.name}
            {p.seller.verified && <span title="Verified student" className="inline-flex items-center text-emerald-600"><BadgeCheck className="h-3.5 w-3.5" /><span className="sr-only">Verified student</span></span>}</span>
          <span className="shrink-0">{timeAgo(p.created_at)}</span>
        </div>
        <span className="mt-1 rounded-lg border border-slate-200 py-1.5 text-center text-xs font-semibold text-brand-bluedark group-hover:border-brand-blue group-hover:bg-brand-blue group-hover:text-white">View Details</span>
      </div>
    </Link>
  );
}
