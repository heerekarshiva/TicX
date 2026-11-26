// Pure date helpers for "Today / Tomorrow / This weekend" (India time, matching the rest of the app).
const TZ = 'Asia/Kolkata';
export type When = 'any' | 'today' | 'tomorrow' | 'weekend';

export function ymdInTz(d: Date, tz = TZ): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  return p; // en-CA => YYYY-MM-DD
}

const addDays = (ymd: string, n: number) => {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
};
const dow = (ymd: string) => { const [y, m, d] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };

/** Inclusive [from, to] show-date range (YYYY-MM-DD). `from` is always >= today so past shows never appear. */
export function dateRange(when: When, now = new Date()): { from: string; to: string | null } {
  const today = ymdInTz(now);
  if (when === 'today') return { from: today, to: today };
  if (when === 'tomorrow') { const t = addDays(today, 1); return { from: t, to: t }; }
  if (when === 'weekend') {
    const w = dow(today); // 0=Sun .. 6=Sat
    if (w === 6) return { from: today, to: addDays(today, 1) };
    if (w === 0) return { from: today, to: today };
    const sat = addDays(today, 6 - w);
    return { from: sat, to: addDays(sat, 1) };
  }
  return { from: today, to: null };
}
