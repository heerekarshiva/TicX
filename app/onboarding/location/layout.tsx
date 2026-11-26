import type { Metadata } from 'next';
import { NOINDEX } from '@/lib/seo';
export const metadata: Metadata = NOINDEX;
export default function Layout({ children }: { children: React.ReactNode }) { return children; }
