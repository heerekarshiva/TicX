import type { Metadata } from 'next';
import { NOINDEX } from '@/lib/seo';
export const metadata: Metadata = { ...NOINDEX, title: 'Sell Your Product – Campus Marketplace' };
export default function Layout({ children }: { children: React.ReactNode }) { return children; }
