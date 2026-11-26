// Client- and server-safe constants for the Campus Marketplace module.
export const CONDITIONS = [
  { value: 'brand_new', label: 'Brand New' },
  { value: 'like_new', label: 'Like New' },
  { value: 'good', label: 'Good' },
  { value: 'acceptable', label: 'Acceptable' }
] as const;
export type Condition = (typeof CONDITIONS)[number]['value'];
export const conditionLabel = (v: string) => CONDITIONS.find(c => c.value === v)?.label ?? v;

export const CONTACT_METHODS = [
  { value: 'chat_and_offers', label: 'Messages & offers' },
  { value: 'chat_only', label: 'Messages only' },
  { value: 'offers_only', label: 'Offers only' }
] as const;

export const REPORT_REASONS = [
  { value: 'prohibited_item', label: 'Prohibited item' },
  { value: 'scam_or_fraud', label: 'Scam or fraud' },
  { value: 'misleading', label: 'Misleading listing' },
  { value: 'duplicate', label: 'Duplicate listing' },
  { value: 'inappropriate', label: 'Inappropriate content' },
  { value: 'other', label: 'Other' }
] as const;

export const SORTS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' }
] as const;

export const MAX_IMAGES = 5;
export const PAGE_SIZE = 12;
export const BUCKET = 'campus-products';
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // enforced server-side AFTER client-side compression

export const LISTING_STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  active: 'success', pending: 'warning', paused: 'neutral', sold: 'info', removed: 'danger', rejected: 'danger'
};
