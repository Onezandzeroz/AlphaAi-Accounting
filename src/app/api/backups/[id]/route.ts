import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/session';
import { restoreBackup } from '@/lib/backup-engine';
import { requestMetadata } from '@/lib/audit';
import { auditLog } from '@/lib/audit';
import fs from 'fs';

type RouteContext = {
  params: Promise<{ id: string }>;
};

// GET - Get a single backup's details
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;

    const backup = await db.backup.findFirst({
      where: { id, userId: user.id },
    });

    if (!backup) {
      return NextResponse.json({ error: 'Backup not found' }, { status: 404 });
    }

    return NextResponse.json({
      backup: {
        ...backup,
        downloadUrl: `/api/backups/download/${backup.id}`,
      },
    });
  } catch (error) {
    console.error('Get backup error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE - Delete a specific backup file and DB record
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;

    const backup = await db.backup.findFirst({
      where: { id, userId: user.id },
    });

    if (!backup) {
      return NextResponse.json({ error: 'Backup not found' }, { status: 404 });
    }

    // Delete file from disk
    if (backup.filePath && fs.existsSync(backup.filePath)) {
      fs.unlinkSync(backup.filePath);
    }

    // Delete from database
    await db.backup.delete({ where: { id } });

    // Audit log
    await auditLog({
      action: 'DELETE_ATTEMPT',
      entityType: 'Backup',
      entityId: id,
      userId: user.id,
      metadata: {
        ...requestMetadata(request),
        deletedBackupType: backup.backupType,
        deletedBackupTrigger: backup.triggerType,
      },
    });

    return NextResponse.json({ success: true, message: 'Backup deleted' });
  } catch (error) {
    console.error('Delete backup error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST with ?action=restore - Restore from this backup
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    if (action !== 'restore') {
      return NextResponse.json(
        { error: 'Invalid action. Use ?action=restore to restore from backup.' },
        { status: 400 }
      );
    }

    const result = await restoreBackup(user.id, id, requestMetadata(request));

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, message: 'Backup restored successfully' });
  } catch (error) {
    console.error('Restore backup error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
