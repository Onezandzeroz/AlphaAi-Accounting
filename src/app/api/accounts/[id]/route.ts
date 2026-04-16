import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/session';
import { auditUpdate, auditCancel, requestMetadata } from '@/lib/audit';
import { getDemoFilter } from '@/lib/demo-filter';

type RouteContext = {
  params: Promise<{ id: string }>;
};

// GET - Get a single account
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    const demoFilter = await getDemoFilter(user.id);

    const account = await db.account.findFirst({
      where: { id, userId: user.id, ...demoFilter },
    });

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    return NextResponse.json({ account });
  } catch (error) {
    console.error('Get account error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT - Update an account (prevent updating number)
export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    const body = await request.json();
    const { number, name, nameEn, type, group, description, isActive } = body;
    const demoFilter = await getDemoFilter(user.id);

    const existing = await db.account.findFirst({
      where: { id, userId: user.id, ...demoFilter },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    // Prevent updating the account number
    if (number && number !== existing.number) {
      return NextResponse.json(
        { error: 'Account number cannot be changed after creation' },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (nameEn !== undefined) updateData.nameEn = nameEn || null;
    if (type !== undefined) updateData.type = type;
    if (group !== undefined) updateData.group = group;
    if (description !== undefined) updateData.description = description || null;
    if (isActive !== undefined) updateData.isActive = isActive;

    const account = await db.account.update({
      where: { id },
      data: updateData,
    });

    await auditUpdate(
      user.id,
      'Account',
      id,
      { name: existing.name, nameEn: existing.nameEn, type: existing.type, group: existing.group, description: existing.description, isActive: existing.isActive },
      updateData as Record<string, unknown>,
      requestMetadata(request)
    );

    return NextResponse.json({ account });
  } catch (error) {
    console.error('Update account error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE - Soft-delete (set isActive=false, isSystem accounts cannot be deleted)
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    const demoFilter = await getDemoFilter(user.id);

    const existing = await db.account.findFirst({
      where: { id, userId: user.id, ...demoFilter },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    if (existing.isSystem) {
      return NextResponse.json(
        { error: 'System accounts cannot be deleted' },
        { status: 400 }
      );
    }

    const account = await db.account.update({
      where: { id },
      data: { isActive: false },
    });

    await auditCancel(
      user.id,
      'Account',
      id,
      'Account deactivated via DELETE',
      requestMetadata(request)
    );

    return NextResponse.json({ account });
  } catch (error) {
    console.error('Delete account error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
