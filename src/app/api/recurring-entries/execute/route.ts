import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/session';
import { auditCreate, requestMetadata } from '@/lib/audit';
import { RecurringFrequency } from '@prisma/client';
import { getDemoFilter } from '@/lib/demo-filter';

// ─── Helper: Calculate next execution date based on frequency ─────────────

function addFrequency(baseDate: Date, frequency: RecurringFrequency): Date {
  const next = new Date(baseDate);
  switch (frequency) {
    case 'DAILY':
      next.setDate(next.getDate() + 1);
      break;
    case 'WEEKLY':
      next.setDate(next.getDate() + 7);
      break;
    case 'MONTHLY':
      next.setMonth(next.getMonth() + 1);
      break;
    case 'QUARTERLY':
      next.setMonth(next.getMonth() + 3);
      break;
    case 'YEARLY':
      next.setFullYear(next.getFullYear() + 1);
      break;
  }
  return next;
}

// ─── POST - Execute a recurring entry: create a POSTED journal entry ──────

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Missing required field: id' },
        { status: 400 }
      );
    }

    // 1. Fetch the recurring entry, validate it's ACTIVE
    const recurring = await db.recurringEntry.findFirst({
      where: { id, userId: user.id },
    });

    if (!recurring) {
      return NextResponse.json({ error: 'Recurring entry not found' }, { status: 404 });
    }

    if (recurring.status !== 'ACTIVE') {
      return NextResponse.json(
        { error: `Cannot execute a recurring entry with status: ${recurring.status}. Only ACTIVE entries can be executed.` },
        { status: 400 }
      );
    }

    // Parse lines from JSON string
    let parsedLines: Array<{ accountId: string; debit: number; credit: number; description?: string }>;
    try {
      parsedLines = JSON.parse(recurring.lines);
    } catch {
      return NextResponse.json(
        { error: 'Invalid lines data in recurring entry' },
        { status: 500 }
      );
    }

    // Verify all referenced accounts still exist and are active
    const accountIds = [...new Set(parsedLines.map(l => l.accountId))];
    const demoFilter = await getDemoFilter(user.id);
    const accounts = await db.account.findMany({
      where: {
        id: { in: accountIds },
        userId: user.id,
        isActive: true,
        ...demoFilter,
      },
    });

    if (accounts.length !== accountIds.length) {
      const foundIds = new Set(accounts.map(a => a.id));
      const missingIds = accountIds.filter(aid => !foundIds.has(aid));
      return NextResponse.json(
        { error: `Some accounts in the recurring entry are no longer active or valid: ${missingIds.join(', ')}` },
        { status: 400 }
      );
    }

    // 4. Compute sequential reference number
    // Count existing journal entries whose reference starts with the recurring entry's reference prefix
    let sequenceNumber = 1;
    if (recurring.reference) {
      const prefix = recurring.reference;
      const existingCount = await db.journalEntry.count({
        where: {
          userId: user.id,
          reference: { startsWith: prefix },
        },
      });
      sequenceNumber = existingCount + 1;
    }

    const reference = recurring.reference
      ? `${recurring.reference}${String(sequenceNumber).padStart(3, '0')}`
      : null;

    // Build journal entry description: recurring name + date
    const executionDate = recurring.nextExecution;
    const dateStr = executionDate.toISOString().split('T')[0];
    const journalDescription = `${recurring.name} — ${dateStr}`;

    // 2. Create a POSTED journal entry with the recurring entry's lines
    const journalEntry = await db.journalEntry.create({
      data: {
        date: executionDate,
        description: journalDescription,
        reference,
        status: 'POSTED',
        userId: user.id,
        lines: {
          create: parsedLines.map(l => ({
            accountId: l.accountId,
            debit: l.debit,
            credit: l.credit,
            description: l.description || null,
          })),
        },
      },
      include: {
        lines: {
          include: {
            account: true,
          },
        },
      },
    });

    // 5. Calculate next execution date
    const nextExecution = addFrequency(executionDate, recurring.frequency as RecurringFrequency);

    // 6. Determine if recurring entry should be set to COMPLETED
    const updateData: Record<string, unknown> = {
      lastExecuted: new Date(),
      nextExecution,
    };

    if (recurring.endDate && nextExecution > new Date(recurring.endDate)) {
      updateData.status = 'COMPLETED';
    }

    // 5. Update recurring entry
    const updatedRecurring = await db.recurringEntry.update({
      where: { id: recurring.id },
      data: updateData,
    });

    // 7. Log to audit trail
    await auditCreate(
      user.id,
      'JournalEntry',
      journalEntry.id,
      {
        source: 'RecurringEntry',
        recurringEntryId: recurring.id,
        recurringEntryName: recurring.name,
        date: dateStr,
        description: journalDescription,
        reference,
        status: 'POSTED',
        lineCount: parsedLines.length,
        totalDebit: parsedLines.reduce((sum, l) => sum + l.debit, 0),
        totalCredit: parsedLines.reduce((sum, l) => sum + l.credit, 0),
      },
      requestMetadata(request)
    );

    return NextResponse.json({
      journalEntry,
      recurringEntry: updatedRecurring,
    });
  } catch (error) {
    console.error('Execute recurring entry error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
