import { describe, it, expect } from 'vitest';
import { productInput, offerInput, reportInput, clean } from '@/lib/campus/schemas';
import { publicTextHasContactInfo, looksLikeSpam } from '@/lib/campus/spam';
import { computeCommission } from '@/lib/campus/commission';
import { inr, discountPct, shortName } from '@/lib/campus/format';

const uuid = '123e4567-e89b-42d3-a456-426614174000';
const good = {
  title: 'Casio fx-991EX calculator', description: 'Barely used, works perfectly, includes cover.', categoryId: uuid, sellingPrice: 800, originalPrice: 1200,
  condition: 'like_new', priceType: 'negotiable', collegeName: 'IIT Hyderabad', collegeLocation: '', city: 'Sangareddy', state: 'Telangana',
  contactMethod: 'chat_and_offers', pickupAvailable: true, meetOnCampus: false, deliveryAvailable: false, images: [`${uuid}/${uuid}.webp`]
};

describe('product validation', () => {
  it('accepts a valid listing and normalises empty optionals', () => {
    const r = productInput.safeParse(good); expect(r.success).toBe(true);
    if (r.success) expect(r.data.collegeLocation).toBeUndefined();
  });
  it('rejects original price below selling price', () => expect(productInput.safeParse({ ...good, originalPrice: 500 }).success).toBe(false));
  it('rejects 0 photos and more than 5 photos', () => {
    expect(productInput.safeParse({ ...good, images: [] }).success).toBe(false);
    expect(productInput.safeParse({ ...good, images: Array(6).fill(`${uuid}/${uuid}.webp`) }).success).toBe(false);
  });
  it('rejects unknown condition, negative price, and no handover option', () => {
    expect(productInput.safeParse({ ...good, condition: 'mint' }).success).toBe(false);
    expect(productInput.safeParse({ ...good, sellingPrice: -1 }).success).toBe(false);
    expect(productInput.safeParse({ ...good, pickupAvailable: false }).success).toBe(false);
  });
  it('strips HTML tags from text (XSS defence in depth)', () => {
    const r = productInput.safeParse({ ...good, title: 'Book <script>alert(1)</script> sale' });
    expect(r.success && !/[<>]/.test(r.data.title)).toBe(true);
    expect(clean('a<img src=x onerror=1>b')).toBe('ab');
  });
  it('rejects a seller_id smuggled into the body being used (field is simply not part of the schema)', () => {
    const r = productInput.safeParse({ ...good, seller_id: uuid }); expect(r.success && 'seller_id' in r.data).toBe(false);
  });
});

describe('offers & reports validation', () => {
  it('requires a positive offer', () => { expect(offerInput.safeParse({ productId: uuid, price: 0 }).success).toBe(false); expect(offerInput.safeParse({ productId: uuid, price: 450 }).success).toBe(true); });
  it('only accepts known report reasons', () => { expect(reportInput.safeParse({ productId: uuid, reason: 'scam_or_fraud' }).success).toBe(true); expect(reportInput.safeParse({ productId: uuid, reason: 'nope' }).success).toBe(false); });
});

describe('contact details are kept out of public listing text', () => {
  it.each(['call me 98765 43210', 'mail me at rahul@gmail.com', 'whatsapp me', 'reach me on t.me/rahul', 'rahul (at) gmail (dot) com'])('blocks %s', t => expect(publicTextHasContactInfo(t)).toBe(true));
  it.each(['Selling for ₹12,500 in good condition', 'Edition 2019, 3rd semester, 450 pages', 'Casio fx-991EX'])('allows %s', t => expect(publicTextHasContactInfo(t)).toBe(false));
  it('flags obvious spam but not normal messages', () => {
    expect(looksLikeSpam('click here for guaranteed profit')).toBe(true); expect(looksLikeSpam('http://a.com http://b.com http://c.com')).toBe(true);
    expect(looksLikeSpam('Is this still available? I can pick it up tomorrow.')).toBe(false);
  });
});

describe('commission is only ever calculated for verified, paid transactions', () => {
  it('is null when unverified, even with a rate set', () => expect(computeCommission({ verified: false, amount: 1000, payment_reference: 'pay_1' }, 5)).toBeNull());
  it('is null when verified but no payment reference', () => expect(computeCommission({ verified: true, amount: 1000 }, 5)).toBeNull());
  it('is null when the rate is 0 (default) or absurd', () => { expect(computeCommission({ verified: true, amount: 1000, payment_reference: 'p' }, 0)).toBeNull(); expect(computeCommission({ verified: true, amount: 1000, payment_reference: 'p' }, 90)).toBeNull(); });
  it('computes correctly for a verified paid transaction', () => expect(computeCommission({ verified: true, amount: 1250, payment_reference: 'pay_1' }, 4)).toBe(50));
});

describe('formatting', () => {
  it('formats rupees', () => { expect(inr(12500)).toBe('₹12,500'); expect(inr(null)).toBe(''); });
  it('computes discount only when original > selling', () => { expect(discountPct(800, 1200)).toBe(33); expect(discountPct(800, 800)).toBe(0); expect(discountPct(800, null)).toBe(0); });
  it('shows first name + last initial only (no full names in public)', () => { expect(shortName('Rahul Kumar Sharma')).toBe('Rahul S.'); expect(shortName('')).toBe('Student'); expect(shortName('Asha')).toBe('Asha'); });
});
