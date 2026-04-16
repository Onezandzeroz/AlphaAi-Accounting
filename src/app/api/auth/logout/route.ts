import { NextResponse } from 'next/server';
import { destroySession, getAuthUser } from '@/lib/session';
import { auditAuth, requestMetadata } from '@/lib/audit';
import { cookies } from 'next/headers';

export async function POST(request: Request) {
  try {
    const user = await getAuthUser(request);
    const cookieStore = await cookies();

    // Destroy session from cookie
    await destroySession();

    // Clear the session cookie
    cookieStore.delete('session');

    // Also clear old userId cookie if it exists (migration)
    cookieStore.delete('userId');

    // Audit logout
    if (user) {
      await auditAuth(user.id, 'LOGOUT', requestMetadata(request));
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
