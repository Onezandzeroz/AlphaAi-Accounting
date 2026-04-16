/**
 * Secure session management
 *
 * Replaces the insecure plain userId cookie with:
 * - Cryptographically secure random session tokens
 * - Session validation against database
 * - Automatic expiry (7 days default, sliding)
 * - Session invalidation on logout
 */

import { db } from '@/lib/db';
import { cookies } from 'next/headers';
import crypto from 'crypto';

export const SESSION_COOKIE_NAME = 'session';
const SESSION_MAX_AGE_DAYS = 7;

/**
 * Generate a cryptographically secure session token
 */
function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Create a new session for a user and set the cookie
 */
export async function createSession(
  userId: string,
  request?: Request
): Promise<string> {
  const token = generateToken();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_MAX_AGE_DAYS);

  // Extract IP and user agent if available
  const ipAddress = request?.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request?.headers.get('x-real-ip')
    || null;
  const userAgent = request?.headers.get('user-agent') || null;

  await db.session.create({
    data: {
      token,
      userId,
      ipAddress,
      userAgent,
      expiresAt,
    },
  });

  return token;
}

/**
 * Get the current authenticated user from session
 * Returns null if not authenticated
 */
export async function getAuthUser(request?: Request): Promise<{ id: string; email: string; businessName?: string | null } | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!token) return null;

  // Find valid session
  const session = await db.session.findUnique({
    where: { token },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          businessName: true,
        },
      },
    },
  });

  if (!session) return null;

  // Check if session expired
  if (session.expiresAt < new Date()) {
    await db.session.delete({ where: { id: session.id } });
    return null;
  }

  // Sliding expiry: extend session on each use
  const newExpiresAt = new Date();
  newExpiresAt.setDate(newExpiresAt.getDate() + SESSION_MAX_AGE_DAYS);
  await db.session.update({
    where: { id: session.id },
    data: { expiresAt: newExpiresAt },
  });

  return session.user;
}

/**
 * Delete a session (logout)
 */
export async function destroySession(token?: string): Promise<void> {
  const cookieStore = await cookies();
  const sessionToken = token || cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (sessionToken) {
    await db.session.deleteMany({ where: { token: sessionToken } });
  }
}

/**
 * Delete all sessions for a user (e.g., password change)
 */
export async function destroyAllUserSessions(userId: string): Promise<void> {
  await db.session.deleteMany({ where: { userId } });
}

/**
 * Clean up expired sessions (call periodically)
 */
export async function cleanupExpiredSessions(): Promise<number> {
  const result = await db.session.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return result.count;
}
