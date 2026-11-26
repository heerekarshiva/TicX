'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { MapPin, LocateFixed, Loader2, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { COUNTRIES, INDIA_STATES, INDIA_STATE_NAMES } from '@/lib/geo/cities';

export interface PickedLocation { country: string; state: string; city: string }
interface Props {
  initial?: Partial<PickedLocation>;
  submitLabel?: string;
  onSaved: (l: PickedLocation) => void;
  onSkip?: () => void;
}

const sel = 'min-h-[44px] w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-navy-900 outline-none transition focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20';

export function LocationPicker({ initial, submitLabel = 'Save city', onSaved, onSkip }: Props) {
  const [country, setCountry] = useState(initial?.country || 'India');
  const [state, setState] = useState(initial?.state || '');
  const [city, setCity] = useState(initial?.city || '');
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [permission, setPermission] = useState<'granted' | 'denied' | 'manual'>('manual');
  const [detecting, setDetecting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // Re-sync if the saved location arrives after mount (profile page loads it asynchronously).
  useEffect(() => {
    if (initial?.city) { setCountry(initial.country || 'India'); setState(initial.state || ''); setCity(initial.city); }
  }, [initial?.city, initial?.state, initial?.country]);

  useEffect(() => {
    const close = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const isIndia = country === 'India';
  const options = useMemo(() => {
    if (!isIndia) return [] as string[];
    const pool = state && INDIA_STATES[state] ? INDIA_STATES[state] : Object.values(INDIA_STATES).flat();
    const q = city.trim().toLowerCase();
    return Array.from(new Set(pool)).filter(c => !q || c.toLowerCase().includes(q)).sort().slice(0, 40);
  }, [isIndia, state, city]);

  function detect() {
    setError(null); setNotice(null);
    if (!('geolocation' in navigator)) { setPermission('denied'); setNotice('Location is not available on this device. Please choose your city below.'); return; }
    setDetecting(true);
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const { latitude, longitude } = pos.coords;
        try {
          const r = await fetch(`/api/geo/reverse?lat=${latitude}&lng=${longitude}`);
          const d = await r.json();
          if (!r.ok) { setNotice(d.error ?? 'Could not detect your city. Please choose it manually.'); setPermission('denied'); return; }
          const matchState = INDIA_STATE_NAMES.find(s => s.toLowerCase() === String(d.state).toLowerCase()) ?? d.state;
          const matchCountry = (COUNTRIES as readonly string[]).find(c => c.toLowerCase() === String(d.country).toLowerCase()) ?? 'Other';
          setCountry(matchCountry); setState(matchState); setCity(d.city);
          setCoords({ latitude: d.latitude, longitude: d.longitude }); setPermission('granted');
          setNotice(`Detected: ${d.city}${matchState ? ', ' + matchState : ''}. You can change it below.`);
        } catch { setNotice('Could not detect your city. Please choose it manually.'); setPermission('denied'); }
        finally { setDetecting(false); }
      },
      err => {
        setDetecting(false); setPermission('denied');
        setNotice(err.code === 1 ? 'Location permission was denied. No problem — choose your city below.' : 'Could not get your location. Please choose your city below.');
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 }
    );
  }

  async function save() {
    setError(null);
    if (!city.trim()) { setError('Please select or type your city.'); return; }
    setSaving(true);
    try {
      const body: Record<string, unknown> = { country, state, city: city.trim(), permission: coords && permission === 'granted' ? 'granted' : permission === 'denied' ? 'denied' : 'manual' };
      if (coords && permission === 'granted') { body.latitude = coords.latitude; body.longitude = coords.longitude; }
      const r = await fetch('/api/profile/location', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(d.error ?? 'Could not save your city. Please try again.'); return; }
      onSaved({ country, state, city: city.trim() });
    } catch { setError('Network error. Please try again.'); }
    finally { setSaving(false); }
  }

  return (
    <div className="space-y-4">
      <Button type="button" variant="outline" className="w-full" onClick={detect} disabled={detecting}>
        {detecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4 text-brand-blue" />} Use My Current Location
      </Button>
      {notice && <p className="rounded-lg bg-brand-gradient-soft p-3 text-xs text-slate-600">{notice}</p>}

      <div>
        <label className="mb-1 block text-sm font-medium text-navy-900">Country</label>
        <select className={sel} value={country} onChange={e => { setCountry(e.target.value); setState(''); setCity(''); setCoords(null); setPermission('manual'); }}>
          {COUNTRIES.map(c => <option key={c}>{c}</option>)}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-navy-900">State</label>
        {isIndia
          ? <select className={sel} value={state} onChange={e => { setState(e.target.value); setCity(''); }}>
              <option value="">Select state</option>
              {INDIA_STATE_NAMES.map(s => <option key={s}>{s}</option>)}
            </select>
          : <Input placeholder="State / region (optional)" value={state} maxLength={80} onChange={e => setState(e.target.value)} />}
      </div>

      <div ref={boxRef} className="relative">
        <label className="mb-1 block text-sm font-medium text-navy-900">City</label>
        <div className="relative">
          <Input placeholder={isIndia ? 'Search or type your city' : 'Type your city'} value={city} maxLength={80} autoComplete="off"
            onFocus={() => setOpen(true)} onChange={e => { setCity(e.target.value); setOpen(true); setCoords(null); setPermission(p => (p === 'granted' ? 'manual' : p)); }} />
          {isIndia && <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />}
        </div>
        {open && options.length > 0 && (
          <ul role="listbox" className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-slate-100 bg-white py-1 shadow-soft">
            {options.map(c => (
              <li key={c}>
                <button type="button" role="option" aria-selected={c === city} className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-navy-900 hover:bg-brand-gradient-soft"
                  onClick={() => { setCity(c); setOpen(false); setCoords(null); setPermission(p => (p === 'granted' ? 'manual' : p)); }}>
                  <MapPin className="h-3.5 w-3.5 text-slate-400" />{c}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && <p className="text-sm text-rose-600" role="alert">{error}</p>}
      <Button type="button" className="w-full" onClick={save} disabled={saving}>{saving ? 'Saving…' : submitLabel}</Button>
      {onSkip && <button type="button" onClick={onSkip} className="block w-full text-center text-xs text-slate-400 hover:text-slate-600">Skip for now</button>}
    </div>
  );
}
