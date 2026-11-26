import { describe, it, expect } from 'vitest';
import { cityVariants, sameCity, normalizeCity, INDIA_STATES } from '@/lib/geo/cities';
import { locationSchema, reverseGeoQuery, roundCoord } from '@/lib/geo/location';
import { dateRange, ymdInTz } from '@/lib/discover-dates';

describe('city matching', () => {
  it('treats Bengaluru/Bangalore as one city and keeps Hyderabad separate', () => {
    expect(sameCity('Bengaluru', 'bangalore')).toBe(true);
    expect(sameCity('Bangalore ', 'BENGALURU')).toBe(true);
    expect(sameCity('Hyderabad', 'Bengaluru')).toBe(false);
    expect(sameCity('Hyderabad', null)).toBe(false);
  });
  it('variants include the input for unknown cities and are empty for blank', () => {
    expect(cityVariants('Warangal')).toEqual(['warangal']);
    expect(cityVariants('  ')).toEqual([]);
    expect(normalizeCity('St. Louis!')).toBe('st louis');
  });
  it('India data has Telangana -> Hyderabad', () => { expect(INDIA_STATES['Telangana']).toContain('Hyderabad'); });
});

describe('location validation', () => {
  it('accepts a manual city and rejects script/odd characters', () => {
    expect(locationSchema.safeParse({ country: 'India', state: 'Telangana', city: 'Hyderabad', permission: 'manual' }).success).toBe(true);
    expect(locationSchema.safeParse({ country: 'India', state: '', city: '<script>', permission: 'manual' }).success).toBe(false);
    expect(locationSchema.safeParse({ country: 'India', city: '', permission: 'manual' }).success).toBe(false);
  });
  it('rejects out-of-range coordinates and rounds to ~1km', () => {
    expect(reverseGeoQuery.safeParse({ lat: 91, lng: 0 }).success).toBe(false);
    expect(roundCoord(17.385044)).toBe(17.39);
  });
});

describe('date filters (IST)', () => {
  const wed = new Date('2026-11-04T06:00:00Z');   // Wednesday
  it('today / tomorrow', () => {
    expect(dateRange('today', wed)).toEqual({ from: '2026-11-04', to: '2026-11-04' });
    expect(dateRange('tomorrow', wed)).toEqual({ from: '2026-11-05', to: '2026-11-05' });
    expect(dateRange('any', wed)).toEqual({ from: '2026-11-04', to: null });
  });
  it('weekend resolves to the upcoming Sat-Sun, and to the remainder when already on it', () => {
    expect(dateRange('weekend', wed)).toEqual({ from: '2026-11-07', to: '2026-11-08' });
    expect(dateRange('weekend', new Date('2026-11-07T06:00:00Z'))).toEqual({ from: '2026-11-07', to: '2026-11-08' });
    expect(dateRange('weekend', new Date('2026-11-08T06:00:00Z'))).toEqual({ from: '2026-11-08', to: '2026-11-08' });
  });
  it('uses India time near midnight UTC', () => { expect(ymdInTz(new Date('2026-11-03T20:00:00Z'))).toBe('2026-11-04'); });
});
