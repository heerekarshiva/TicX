// Lightweight, dependency-free abuse heuristics. These complement (not replace) rate limits and reports.
const EMAIL = /[A-Z0-9._%+-]+\s*(@|\(at\)|\[at\])\s*[A-Z0-9.-]+\s*(\.|\(dot\)|\[dot\])\s*[A-Z]{2,}/i;
const PHONE = /(?:\+?\d[\s-]?){10,13}/;
const MESSENGER = /\b(whats\s?app|telegram|t\.me\/|wa\.me\/)\b/i;

/** Public listing text must not carry contact details: contact goes through in-app chat (privacy + anti-scam). */
export function publicTextHasContactInfo(...parts: (string | undefined | null)[]): boolean {
  const t = parts.filter(Boolean).join(' \n ');
  return EMAIL.test(t) || PHONE.test(t.replace(/[₹,]/g, '')) || MESSENGER.test(t);
}

export function looksLikeSpam(msg: string): boolean {
  const links = (msg.match(/https?:\/\/|www\./gi) ?? []).length;
  return links > 2 || /(.)\1{12,}/.test(msg) || /\b(click here|free money|guaranteed profit|crypto|investment)\b/i.test(msg);
}
