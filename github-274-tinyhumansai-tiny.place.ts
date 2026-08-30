// File: lib/supabase/rls.ts
// Fix: Update RLS policy to allow admin users to update bounty status
export const updateBountyPolicy = `
CREATE POLICY "Admins can update bounty status"
ON bounties
FOR UPDATE
TO authenticated
USING (
  auth.jwt() ->> 'role' = 'admin'
  OR EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
  )
)
WITH CHECK (
  auth.jwt() ->> 'role' = 'admin'
  OR EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
  )
);
`;

// File: pages/api/bounties/[id]/approve.ts
// Fix: Ensure proper auth validation and role verification
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify admin role via JWT claim or user_roles table
    const { data: roleData, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (roleError || !roleData) {
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { status } = await req.json();

    if (status !== 'approved' && status !== 'paid') {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    const { error: updateError } = await supabase
      .from('bounties')
      .update({ status })
      .eq('id', params.id);

    if (updateError) {
      console.error('Bounty update error:', updateError);
      return NextResponse.json({ error: 'Internal server error' }, { status: 503 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Approval error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 503 });
  }
}