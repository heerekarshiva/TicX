import type { Metadata } from 'next';
import { NOINDEX } from '@/lib/seo';
export const metadata: Metadata = { ...NOINDEX, title: 'My Campus Marketplace' };
export default function Layout({ children }: { children: React.ReactNode }) { return children; }
