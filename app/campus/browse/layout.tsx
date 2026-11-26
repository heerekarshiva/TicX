import type { Metadata } from 'next';
import { NOINDEX } from '@/lib/seo';
// Filter/search URLs are thin duplicates: keep them out of the index.
export const metadata: Metadata = { ...NOINDEX, title: 'Browse Campus Marketplace' };
export default function Layout({ children }: { children: React.ReactNode }) { return children; }
