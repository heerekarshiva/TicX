import { z } from 'zod';

const place = (max: number) => z.string().trim().min(1).max(max).regex(/^[\p{L}\p{M}0-9 .,'()\-&/]+$/u, 'Contains unsupported characters');

export const locationSchema = z.object({
  country: place(60),
  state: place(80).optional().or(z.literal('')),
  city: place(80),
  // Only sent when the browser granted geolocation. Rounded server-side to ~1 km (city-level precision).
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  permission: z.enum(['granted', 'denied', 'manual'])
});
export type LocationInput = z.infer<typeof locationSchema>;

export const skipSchema = z.object({ skip: z.literal(true) });

export const reverseGeoQuery = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180)
});

/** ~1.1 km precision. We never store an exact position. */
export const roundCoord = (n: number) => Math.round(n * 100) / 100;

export interface SavedLocation {
  country: string | null; state: string | null; city: string | null;
  permission: 'unset' | 'granted' | 'denied' | 'manual' | 'skipped';
}
