import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/session';
import { auditCreate, auditUpdate, auditCancel, auditDeleteAttempt, requestMetadata } from '@/lib/audit';

// GET - Fetch all non-cancelled transactions for the logged-in user
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const transactions = await db.transaction.findMany({
      where: { userId: user.id, cancelled: false },
      orderBy: { date: 'desc' },
    });

    return NextResponse.json({ transactions });
  } catch (error) {
    console.error('Get transactions error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Create a new transaction
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { type, date, amount, description, vatPercent, receiptImage } = body;

    if (!date || !amount || !description) {
      return NextResponse.json(
        { error: 'Date, amount, and description are required' },
        { status: 400 }
      );
    }

    const transaction = await db.transaction.create({
      data: {
        type: type || 'SALE',
        date: new Date(date),
        amount: parseFloat(amount),
        description,
        vatPercent: vatPercent ?? 25.0,
        receiptImage,
        userId: user.id,
      },
    });

    // Audit log
    await auditCreate(
      user.id,
      'Transaction',
      transaction.id,
      { type, date, amount: parseFloat(amount), description, vatPercent, receiptImage },
      requestMetadata(request)
    );

    return NextResponse.json({ transaction });
  } catch (error) {
    console.error('Create transaction error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT - Update a transaction (e.g., attach receipt) — with audit trail
export async function PUT(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { id, receiptImage } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Transaction ID is required' },
        { status: 400 }
      );
    }

    // Verify ownership
    const existing = await db.transaction.findFirst({
      where: { id, userId: user.id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Transaction not found' },
        { status: 404 }
      );
    }

    // Update only allowed fields
    const updateData: Record<string, unknown> = {};
    if (receiptImage !== undefined) {
      updateData.receiptImage = receiptImage;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'No fields to update' },
        { status: 400 }
      );
    }

    const transaction = await db.transaction.update({
      where: { id },
      data: updateData,
    });

    // Audit log with old/new values
    await auditUpdate(
      user.id,
      'Transaction',
      id,
      { receiptImage: existing.receiptImage },
      { receiptImage },
      requestMetadata(request)
    );

    return NextResponse.json({ transaction });
  } catch (error) {
    console.error('Update transaction error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE - Soft-delete (cancel) a transaction — NOT a hard delete
// Per bogføringsloven, transactions must be preserved (cancelled, not deleted)
export async function DELETE(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const reason = searchParams.get('reason') || 'User requested cancellation';

    if (!id) {
      return NextResponse.json(
        { error: 'Transaction ID is required' },
        { status: 400 }
      );
    }

    // Verify ownership
    const transaction = await db.transaction.findFirst({
      where: { id, userId: user.id, cancelled: false },
    });

    if (!transaction) {
      return NextResponse.json(
        { error: 'Transaction not found or already cancelled' },
        { status: 404 }
      );
    }

    // Soft-delete: mark as cancelled instead of deleting
    await db.transaction.update({
      where: { id },
      data: {
        cancelled: true,
        cancelReason: reason,
      },
    });

    // Audit log
    await auditCancel(
      user.id,
      'Transaction',
      id,
      reason,
      requestMetadata(request)
    );

    return NextResponse.json({ success: true, message: 'Transaction cancelled (soft-delete)' });
  } catch (error) {
    console.error('Cancel transaction error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
