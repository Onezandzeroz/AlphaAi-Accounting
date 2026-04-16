import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/session';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const record = await db.user.findUnique({
      where: { id: user.id },
      select: { sidebarPrefs: true },
    });

    let prefs = null;
    if (record?.sidebarPrefs) {
      try {
        prefs = JSON.parse(record.sidebarPrefs);
      } catch {
        prefs = null;
      }
    }

    return NextResponse.json({ preferences: prefs });
  } catch (error) {
    console.error('Get sidebar preferences error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { expandedSections } = body;

    if (!Array.isArray(expandedSections)) {
      return NextResponse.json(
        { error: 'expandedSections must be an array' },
        { status: 400 }
      );
    }

    const validSections = [
      'daily-operations',
      'bookkeeping',
      'reporting',
      'compliance',
      'maintenance',
    ];

    const filtered = expandedSections.filter((s: string) =>
      validSections.includes(s)
    );

    await db.user.update({
      where: { id: user.id },
      data: {
        sidebarPrefs: JSON.stringify({ expandedSections: filtered }),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Save sidebar preferences error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
