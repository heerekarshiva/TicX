'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { LocationPicker, type PickedLocation } from '@/components/LocationPicker';

export default function LocationOnboardingPage() {
  const router = useRouter();
  const [initial, setInitial] = useState<Partial<PickedLocation> | undefined>();
  const [ready, setReady] = useState(false);

  // Safe same-site redirect target only.
  const next = () => {
    const n = new URLSearchParams(window.location.search).get('next');
    return n && n.startsWith('/') && !n.startsWith('//') ? n : '/home';
  };

  useEffect(() => {
    fetch('/api/profile/location').then(r => r.json()).then(d => { if (d?.city) setInitial({ country: d.country ?? 'India', state: d.state ?? '', city: d.city }); }).catch(() => {}).finally(() => setReady(true));
  }, []);

  async function skip() {
    await fetch('/api/profile/location', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ skip: true }) }).catch(() => {});
    router.push(next()); router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-gradient-soft px-4 py-10">
      <div className="w-full max-w-sm rounded-xl2 bg-white p-8 shadow-soft">
        <div className="flex justify-center"><Logo /></div>
        <h1 className="mt-6 text-center text-xl font-semibold text-navy-900">Discover what&apos;s happening around you!</h1>
        <p className="mb-6 mt-1 text-center text-sm text-slate-500">Select your city to find nearby movie tickets, events and hackathons.</p>
        {ready && <LocationPicker initial={initial} submitLabel="Continue" onSkip={skip} onSaved={() => { router.push(next()); router.refresh(); }} />}
      </div>
    </div>
  );
}
