import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { authed, json, fail, rateLimit } from '@/lib/campus/server';
import { BUCKET, MAX_IMAGE_BYTES } from '@/lib/campus/constants';
import { imageUrl } from '@/lib/campus/format';

export const dynamic = 'force-dynamic';

// Real file signatures, not the client-declared MIME type.
function sniff(b: Buffer): 'jpg' | 'png' | 'webp' | null {
  if (b.length > 12 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (b.length > 12 && b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp';
  return null;
}
const MIME = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' } as const;

export async function POST(req: NextRequest) {
  const a = await authed({ write: true }); if (a instanceof NextResponse) return a;
  const limited = await rateLimit(`upload:${a.user.id}`, 40, 3_600_000, 'Upload limit reached. Please try again later.'); if (limited) return limited;
  if (Number(req.headers.get('content-length') ?? 0) > MAX_IMAGE_BYTES + 100_000) return fail('Image is too large (max 2 MB).', 413);
  let form: FormData;
  try { form = await req.formData(); } catch { return fail('Invalid upload.'); }
  const file = form.get('file');
  if (!(file instanceof File)) return fail('No file provided.');
  if (file.size === 0 || file.size > MAX_IMAGE_BYTES) return fail('Image must be under 2 MB.', 413);
  const buf = Buffer.from(await file.arrayBuffer());
  const kind = sniff(buf);
  if (!kind) return fail('Only JPG, PNG or WEBP images are allowed.', 415);

  // Path is server-generated and namespaced by the SESSION user id; nothing from the client is used in it.
  const path = `${a.user.id}/${randomUUID()}.${kind}`;
  const { error } = await a.admin.storage.from(BUCKET).upload(path, buf, { contentType: MIME[kind], upsert: false, cacheControl: '31536000' });
  if (error) { console.error('[campus] upload failed:', error.message); return fail('Could not store the image. Please try again.', 500); }
  return json({ path, url: imageUrl(path) }, 201);
}
