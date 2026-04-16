import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/session';
import fs from 'fs';
import path from 'path';

type RouteContext = {
  params: Promise<{ id: string }>;
};

// GET - Download a backup file as an attachment
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

    if (!backup.filePath || !fs.existsSync(backup.filePath)) {
      return NextResponse.json(
        { error: 'Backup file not found on disk' },
        { status: 404 }
      );
    }

    const fileBuffer = fs.readFileSync(backup.filePath);
    const filename = path.basename(backup.filePath);

    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': fileBuffer.length.toString(),
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error) {
    console.error('Download backup error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
