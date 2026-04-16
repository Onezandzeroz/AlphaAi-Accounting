import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, destroyAllUserSessions } from '@/lib/session';
import { auditLog, requestMetadata } from '@/lib/audit';
import { cookies } from 'next/headers';

export async function DELETE(request: Request) {
  try {
    const user = await getAuthUser(request);

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify user exists
    const existingUser = await db.user.findUnique({ where: { id: user.id } });
    if (!existingUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Audit the account deletion before it happens
    await auditLog({
      action: 'DELETE_ATTEMPT',
      entityType: 'User',
      entityId: user.id,
      userId: user.id,
      metadata: requestMetadata(request),
    });

    // Destroy all sessions first
    await destroyAllUserSessions(user.id);

    // Delete user (cascade will handle related data)
    await db.user.delete({ where: { id: user.id } });

    // Clear cookies
    const cookieStore = await cookies();
    cookieStore.delete('session');
    cookieStore.delete('userId');

    return NextResponse.json({ success: true, message: 'Account deleted successfully' });
  } catch (error) {
    console.error('Failed to delete account:', error);
    return NextResponse.json({ error: 'Failed to delete account' }, { status: 500 });
  }
}
