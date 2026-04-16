import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/session';
import { createBackup } from '@/lib/backup-engine';
import { requestMetadata } from '@/lib/audit';

// GET - List all backups for the authenticated user
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const backups = await db.backup.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });

    // Enrich with download URL
    const enrichedBackups = backups.map((backup) => ({
      ...backup,
      downloadUrl: `/api/backups/download/${backup.id}`,
    }));

    return NextResponse.json({ backups: enrichedBackups });
  } catch (error) {
    console.error('List backups error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Create a manual backup of type 'daily'
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await createBackup(user.id, 'manual', 'daily', {
      source: 'api',
      ...requestMetadata(request),
    });

    if (!result) {
      return NextResponse.json(
        { error: 'Failed to create backup' },
        { status: 500 }
      );
    }

    const backup = await db.backup.findUnique({
      where: { id: result.id },
    });

    return NextResponse.json({
      backup: {
        ...backup,
        downloadUrl: `/api/backups/download/${result.id}`,
      },
    }, { status: 201 });
  } catch (error) {
    console.error('Create backup error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
