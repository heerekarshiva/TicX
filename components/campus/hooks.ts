'use client';
import { useEffect, useState } from 'react';
import { api } from './ui';
import type { CardProduct } from './ProductCard';

export interface Me { college: { name: string; city: string; state: string | null; verified: boolean } | null; suspended: boolean; city: string | null; state: string | null; isAdmin: boolean }
// null = signed out (or not loaded yet); `loading` distinguishes the two.
export function useMe() {
  const [me, setMe] = useState<Me | null>(null); const [loading, setLoading] = useState(true);
  const reload = () => api<Me>('/api/campus/me').then(r => { setMe(r.ok ? r.data : null); setLoading(false); });
  useEffect(() => { reload(); }, []);
  return { me, loading, reload };
}
export interface Category { id: string; name: string; slug: string; description: string | null }
export function useCategories() {
  const [cats, setCats] = useState<Category[]>([]);
  useEffect(() => { api<{ categories: Category[] }>('/api/campus/categories').then(r => r.ok && setCats(r.data.categories)); }, []);
  return cats;
}
export function useProducts(query: string, enabled = true) {
  const [items, setItems] = useState<CardProduct[]>([]); const [loading, setLoading] = useState(enabled); const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!enabled) { setLoading(false); return; }
    let live = true; setLoading(true); setError(null);
    api<{ items: CardProduct[] }>(`/api/campus/products?${query}`).then(r => { if (!live) return; if (r.ok) setItems(r.data.items); else setError(r.error ?? 'Could not load listings.'); setLoading(false); });
    return () => { live = false; };
  }, [query, enabled, tick]);
  return { items, loading, error, reload: () => setTick(t => t + 1) };
}
