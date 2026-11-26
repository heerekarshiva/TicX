// Client- and server-safe formatting helpers.
import { BUCKET } from './constants';

export const inr = (n: number | string | null | undefined) =>
  n === null || n === undefined || n === '' ? '' : '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 });

export function timeAgo(iso: string): string {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Storage path -> public URL. Paths are server-generated; this never accepts arbitrary URLs. */
export const imageUrl = (path: string) => `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;

export const discountPct = (sell: number, orig?: number | null) => (orig && orig > sell ? Math.round(((orig - sell) / orig) * 100) : 0);

export const shortName = (n?: string | null) => {
  const p = (n ?? '').trim().split(/\s+/).filter(Boolean);
  return p.length === 0 ? 'Student' : p.length === 1 ? p[0] : `${p[0]} ${p[p.length - 1][0]}.`;
};
