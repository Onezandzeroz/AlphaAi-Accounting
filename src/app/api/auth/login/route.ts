import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashPassword, verifyPassword, needsRehash } from '@/lib/password';
import { createSession } from '@/lib/session';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { auditAuth, requestMetadata } from '@/lib/audit';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
  try {
    // Rate limiting: max 5 login attempts per minute per IP
    const clientIp = getClientIp(request);
    const { allowed } = rateLimit(`login:${clientIp}`, {
      maxRequests: 5,
      windowMs: 60 * 1000,
    });
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many login attempts. Please try again in 1 minute.' },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Find user
    const user = await db.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (!user) {
      // Audit failed login attempt (fire-and-forget, don't block the response)
      db.auditLog
        .create({
          data: {
            userId: 'unknown',
            action: 'LOGIN_FAILED',
            entityType: 'User',
            entityId: email.toLowerCase().trim(),
            metadata: JSON.stringify({ ...requestMetadata(request), reason: 'user_not_found' }),
          },
        })
        .catch(() => {
          // Silently ignore audit log failures for unknown users
          // (foreign key constraint may prevent recording for non-existent userId)
        });
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    // Verify password
    const valid = await verifyPassword(password, user.password);
    if (!valid) {
      await auditAuth(user.id, 'LOGIN_FAILED', { ...requestMetadata(request), reason: 'wrong_password' });
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    // If password uses old hash, re-hash it with bcrypt
    if (needsRehash(user.password)) {
      const newHash = await hashPassword(password);
      await db.user.update({
        where: { id: user.id },
        data: { password: newHash },
      });
    }

    // Create secure session
    const token = await createSession(user.id, request);

    // Set session cookie
    const cookieStore = await cookies();
    const isHttps = request.headers.get('x-forwarded-proto') === 'https';
    cookieStore.set('session', token, {
      httpOnly: true,
      secure: isHttps,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 1 week
      path: '/',
    });

    // Audit successful login
    await auditAuth(user.id, 'LOGIN', requestMetadata(request));

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        businessName: user.businessName,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
