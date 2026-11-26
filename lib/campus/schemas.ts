import { z } from 'zod';
import { CONDITIONS, CONTACT_METHODS, REPORT_REASONS, MAX_IMAGES } from './constants';

// Strip control characters and anything that looks like an HTML tag. React already escapes output; this is
// defence in depth so stored text is clean for any future consumer (emails, exports, JSON-LD).
export const clean = (s: string) => s.replace(/<[^>]*>/g, '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/[ \t]+/g, ' ').trim();
const text = (min: number, max: number) => z.string().transform(clean).pipe(z.string().min(min).max(max));
const place = (max: number) => z.string().transform(clean).pipe(z.string().min(2).max(max).regex(/^[\p{L}\p{M}0-9 .,'()\-&/]+$/u, 'Contains unsupported characters'));
const optPlace = (max: number) => z.union([z.literal('').transform(() => undefined), place(max)]).optional();
const money = z.coerce.number().finite().min(0).max(10_000_000).transform(n => Math.round(n * 100) / 100);
const enumOf = <T extends readonly { value: string }[]>(a: T) => z.enum(a.map(x => x.value) as [string, ...string[]]);

export const productInput = z.object({
  title: text(3, 120),
  description: text(10, 2000),
  categoryId: z.string().uuid(),
  sellingPrice: money,
  originalPrice: money.nullable().optional(),
  condition: enumOf(CONDITIONS),
  priceType: z.enum(['negotiable', 'fixed']),
  collegeName: place(160),
  collegeLocation: optPlace(160),
  city: place(80),
  state: optPlace(80),
  contactMethod: enumOf(CONTACT_METHODS),
  pickupAvailable: z.boolean(),
  meetOnCampus: z.boolean(),
  deliveryAvailable: z.boolean(),
  images: z.array(z.string().min(10).max(200)).min(1, 'Add at least one photo').max(MAX_IMAGES)
}).refine(v => v.originalPrice == null || v.originalPrice >= v.sellingPrice, { message: 'Original price cannot be lower than the selling price', path: ['originalPrice'] })
  .refine(v => v.pickupAvailable || v.meetOnCampus || v.deliveryAvailable, { message: 'Choose at least one way to hand over the item', path: ['pickupAvailable'] });
export type ProductInput = z.infer<typeof productInput>;

export const productPatch = z.object({ action: z.enum(['pause', 'activate', 'sold', 'edit']), data: productInput.optional() });
export const messageInput = z.object({ message: text(1, 1000) });
export const inquiryInput = z.object({ productId: z.string().uuid(), message: text(1, 1000) });
export const offerInput = z.object({ productId: z.string().uuid(), price: money.refine(n => n > 0, 'Enter an offer'), message: text(1, 500).optional() });
export const offerAction = z.object({ action: z.enum(['accept', 'reject', 'withdraw', 'complete']) });
export const reportInput = z.object({ productId: z.string().uuid(), reason: enumOf(REPORT_REASONS), details: text(0, 500).optional() });
export const wishlistInput = z.object({ productId: z.string().uuid() });
export const promoInput = z.object({ productId: z.string().uuid(), planId: z.string().uuid() });
export const meInput = z.object({ collegeName: place(160), collegeCity: place(80), collegeState: optPlace(80) });
export const collegeQuery = z.object({ q: z.string().transform(clean).pipe(z.string().max(60)).default('') });
