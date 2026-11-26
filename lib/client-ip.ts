import type { NextRequest } from 'next/server';
export const clientIp = (req: NextRequest) => (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';
