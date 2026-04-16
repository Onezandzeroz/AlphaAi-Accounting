import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/session';

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ user: null });
    }
    
    // Fetch demo mode status from DB
    const { db } = await import('@/lib/db');
    const dbUser = await db.user.findUnique({
      where: { id: user.id },
      select: { demoModeEnabled: true },
    });
    
    return NextResponse.json({ 
      user: { ...user, demoModeEnabled: dbUser?.demoModeEnabled ?? false } 
    });
  } catch (error) {
    console.error('Get user error:', error);
    return NextResponse.json({ user: null });
  }
}
