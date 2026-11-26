'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search, PlusCircle, BookOpen, Laptop, Backpack, BedDouble, Package, ArrowRight, GraduationCap } from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import { Footer } from '@/components/Footer';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/ui/Button';
import { ProductCard } from '@/components/campus/ProductCard';
import { ProductGridSkeleton, ErrorState } from '@/components/campus/ui';
import { useCategories, useMe, useProducts } from '@/components/campus/hooks';

const ICONS: Record<string, any> = { 'books-study-materials': BookOpen, electronics: Laptop, 'college-essentials': Backpack, 'hostel-essentials': BedDouble, 'other-products': Package };

function Section({ title, href, children }: { title: string; href?: string; children: React.ReactNode }) {
  return (<section className="mt-10"><div className="mb-4 flex items-end justify-between"><h2 className="text-lg font-bold text-navy-900 sm:text-xl">{title}</h2>
    {href && <Link href={href} className="inline-flex items-center gap-1 text-sm font-semibold text-brand-blue hover:text-brand-bluedark">See all <ArrowRight className="h-4 w-4" /></Link>}</div>{children}</section>);
}
function Grid({ q, empty, cta }: { q: string; empty: string; cta?: React.ReactNode }) {
  const { items, loading, error, reload } = useProducts(q);
  if (loading) return <ProductGridSkeleton n={4} />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!items.length) return <div><EmptyState title={empty} />{cta}</div>;
  return <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">{items.map(p => <ProductCard key={p.id} p={p} />)}</div>;
}

export default function CampusHome() {
  const router = useRouter(); const cats = useCategories(); const { me, loading: meLoading } = useMe();
  const [q, setQ] = useState('');
  const myCollege = me?.college?.name; const myCity = me?.city ?? me?.college?.city;
  const enc = encodeURIComponent;
  return (
    <div className="pb-20 lg:pb-0">
      <Navbar />
      <div className="bg-brand-gradient-soft">
        <div className="container-page py-8 sm:py-12">
          <p className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-semibold text-brand-bluedark shadow-soft"><GraduationCap className="h-3.5 w-3.5" />For college students</p>
          <h1 className="mt-3 max-w-2xl text-3xl font-extrabold leading-tight text-navy-900 sm:text-4xl">Campus Marketplace</h1>
          <p className="mt-2 max-w-xl text-slate-600">Buy and sell books, calculators, laptops and hostel essentials with students from your college and nearby campuses.</p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <form onSubmit={e => { e.preventDefault(); router.push(`/campus/browse${q.trim() ? `?q=${enc(q.trim())}` : ''}`); }} className="relative w-full max-w-xl">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input value={q} onChange={e => setQ(e.target.value)} maxLength={60} aria-label="Search the marketplace" placeholder="Search products, categories, colleges, cities, sellers…"
                className="h-12 w-full rounded-full border border-slate-200 bg-white pl-11 pr-28 text-sm text-navy-900 shadow-soft outline-none placeholder:text-slate-400 focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20" />
              <button className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full bg-brand-gradient px-5 py-2 text-sm font-semibold text-white">Search</button>
            </form>
            <Link href="/campus/sell"><Button size="lg" className="w-full sm:w-auto"><PlusCircle className="h-5 w-5" />Sell Your Product</Button></Link>
          </div>
          <div className="mt-4 flex gap-4 text-sm font-medium"><Link href="/campus/dashboard" className="text-navy-900 underline-offset-4 hover:underline">My listings & activity</Link><Link href="/campus/browse" className="text-navy-900 underline-offset-4 hover:underline">Browse everything</Link></div>
        </div>
      </div>

      <div className="container-page pb-10">
        <Section title="Shop by category">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {(cats.length ? cats : Array.from({ length: 5 }).map((_, i) => ({ id: String(i), name: '', slug: '', description: null }))).map(c => {
              const Icon = ICONS[c.slug] ?? Package;
              return c.name ? (
                <Link key={c.id} href={`/campus/browse?category=${c.slug}`} className="group flex flex-col items-start gap-2 rounded-xl2 border border-slate-100 bg-white p-4 shadow-soft transition hover:-translate-y-0.5 hover:border-brand-blue">
                  <span className="rounded-xl bg-brand-blue/10 p-2.5 text-brand-blue group-hover:bg-brand-blue group-hover:text-white"><Icon className="h-5 w-5" /></span>
                  <span className="text-sm font-semibold text-navy-900">{c.name}</span></Link>
              ) : <div key={c.id} className="h-24 animate-pulse rounded-xl2 bg-slate-100" />;
            })}
          </div>
        </Section>

        <Section title="Featured products" href="/campus/browse?featured=1"><Grid q="featured=1&pageSize=4" empty="No featured products right now." /></Section>
        <Section title="Recently added" href="/campus/browse"><Grid q="sort=newest&pageSize=8" empty="No listings yet. Be the first to sell something!" cta={<div className="mt-4 text-center"><Link href="/campus/sell"><Button>Sell Your Product</Button></Link></div>} /></Section>

        <Section title={myCollege ? `From ${myCollege}` : 'From your college'} href={myCollege ? '/campus/browse?scope=my' : undefined}>
          {meLoading ? <ProductGridSkeleton n={4} /> : myCollege
            ? <Grid q={`college=${enc(myCollege)}&pageSize=4`} empty={`No listings from ${myCollege} yet.`} />
            : <div className="rounded-xl2 border border-dashed border-slate-200 p-8 text-center"><p className="font-medium text-navy-900">{me ? 'Set your college to see listings from it' : 'Sign in to see listings from your college'}</p>
                <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">Your college is self-declared. A “Verified student” badge only appears after our team verifies you.</p>
                <Link href={me ? '/campus/browse?scope=my' : '/login?redirectTo=/campus'} className="mt-4 inline-block"><Button variant="outline">{me ? 'Choose my college' : 'Sign in'}</Button></Link></div>}
        </Section>

        <Section title={myCity ? `Near you in ${myCity}` : 'Nearby colleges'} href={myCity ? '/campus/browse?scope=nearby' : undefined}>
          {meLoading ? <ProductGridSkeleton n={4} /> : myCity
            ? <Grid q={`city=${enc(myCity)}&pageSize=4`} empty={`No listings in ${myCity} yet.`} />
            : <div className="rounded-xl2 border border-dashed border-slate-200 p-8 text-center"><p className="font-medium text-navy-900">Choose your city to see nearby colleges’ listings</p>
                <Link href={me ? '/onboarding/location' : '/login?redirectTo=/campus'} className="mt-4 inline-block"><Button variant="outline">{me ? 'Set my city' : 'Sign in'}</Button></Link></div>}
        </Section>
      </div>
      <Footer />
      <MobileBottomNav />
    </div>
  );
}
