import type { Metadata } from 'next';
import CampusHome from './CampusHome';
import { pageMeta } from '@/lib/seo';

export const metadata: Metadata = pageMeta({
  title: 'Campus Marketplace – Buy & Sell College Products',
  description: 'Buy and sell used and new college essentials — books, calculators, laptops, hostel items and more — with students from your college and nearby campuses.',
  path: '/campus'
});
export default function Page() { return <CampusHome />; }
