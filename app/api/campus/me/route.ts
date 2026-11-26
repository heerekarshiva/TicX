import { NextRequest, NextResponse } from 'next/server';
import { authed, json, fail, readBody, rateLimit, ensureCollege } from '@/lib/campus/server';
import { meInput } from '@/lib/campus/schemas';

export const dynamic = 'force-dynamic';

// The user's DECLARED college and whether an admin has verified it. Declaring a college never makes someone
// "verified" and never grants access to anything.
export async function GET() {
  const a = await authed(); if (a instanceof NextResponse) return a;
  const [{ data: sp }, { data: prof }] = await Promise.all([
    a.admin.from('marketplace_student_profiles').select('college_name, college_city, college_state, verified, suspended').eq('user_id', a.user.id).maybeSingle(),
    a.admin.from('profiles').select('city, state, role').eq('id', a.user.id).maybeSingle()
  ]);
  return json({
    college: sp?.college_name ? { name: sp.college_name, city: sp.college_city, state: sp.college_state, verified: !!sp.verified } : null,
    suspended: !!sp?.suspended, city: prof?.city ?? null, state: prof?.state ?? null, isAdmin: prof?.role === 'admin'
  });
}

export async function PUT(req: NextRequest) {
  const a = await authed({ write: true }); if (a instanceof NextResponse) return a;
  const limited = await rateLimit(`me:${a.user.id}`, 10, 3_600_000); if (limited) return limited;
  const b = await readBody(req, meInput); if ('res' in b) return b.res;
  const { data: cur } = await a.admin.from('marketplace_student_profiles').select('college_name, verified').eq('user_id', a.user.id).maybeSingle();
  const changed = !cur || (cur.college_name ?? '').toLowerCase() !== b.data.collegeName.toLowerCase();
  const { error } = await a.admin.from('marketplace_student_profiles').upsert({
    user_id: a.user.id, college_name: b.data.collegeName, college_city: b.data.collegeCity, college_state: b.data.collegeState ?? null,
    // Changing college drops verification: the admin verified a specific college, not the new one.
    ...(changed ? { verified: false, verified_at: null, verified_by: null } : {}), updated_at: new Date().toISOString()
  }, { onConflict: 'user_id' });
  if (error) return fail('Could not save your college.', 500);
  await ensureCollege(a.admin, a.user.id, b.data.collegeName, b.data.collegeCity, b.data.collegeState);
  return json({ ok: true, verified: changed ? false : !!cur?.verified });
}
