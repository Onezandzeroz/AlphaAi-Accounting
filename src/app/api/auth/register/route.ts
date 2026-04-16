import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/password';
import { createSession } from '@/lib/session';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { auditAuth, requestMetadata } from '@/lib/audit';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
  try {
    // Rate limiting: max 3 registrations per minute per IP
    const clientIp = getClientIp(request);
    const { allowed } = rateLimit(`register:${clientIp}`, {
      maxRequests: 3,
      windowMs: 60 * 1000,
    });
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many registration attempts. Please try again later.' },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { email, password, businessName } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters' },
        { status: 400 }
      );
    }

    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check if user already exists
    const existingUser = await db.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: 'User already exists' },
        { status: 400 }
      );
    }

    // Hash password with bcrypt
    const hashedPassword = await hashPassword(password);

    const user = await db.user.create({
      data: {
        email: normalizedEmail,
        password: hashedPassword,
        businessName,
      },
      select: {
        id: true,
        email: true,
        businessName: true,
      },
    });

    // Create secure session
    const token = await createSession(user.id, request);

    // Set session cookie
    const cookieStore = await cookies();
    const isHttps = request.headers.get('x-forwarded-proto') === 'https';
    cookieStore.set('session', token, {
      httpOnly: true,
      secure: isHttps,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    });

    // Audit registration
    await auditAuth(user.id, 'REGISTER', requestMetadata(request));

    return NextResponse.json({ user });
  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
