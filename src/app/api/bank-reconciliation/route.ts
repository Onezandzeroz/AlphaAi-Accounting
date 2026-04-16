import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/session';
import { auditCreate, auditUpdate, requestMetadata } from '@/lib/audit';
import { getDemoFilter } from '@/lib/demo-filter';

// Helper to round to 2 decimals
const r = (n: number) => Math.round(n * 100) / 100;

// GET candidates for manual matching
async function getCandidates(request: NextRequest, userId: string) {
  const { searchParams } = new URL(request.url);
  const bankLineId = searchParams.get('bankLineId');

  if (!bankLineId) {
    return NextResponse.json({ error: 'Missing bankLineId parameter' }, { status: 400 });
  }

  // Fetch the bank statement line
  const bankLine = await db.bankStatementLine.findUnique({
    where: { id: bankLineId },
    include: { bankStatement: true },
  });

  if (!bankLine || bankLine.bankStatement.userId !== userId) {
    return NextResponse.json({ error: 'Bank statement line not found' }, { status: 404 });
  }

  // Find bank accounts (filtered by demo mode)
  const demoFilter = await getDemoFilter(userId);
  const bankAccounts = await db.account.findMany({
    where: {
      userId,
      group: 'BANK',
      isActive: true,
      ...demoFilter,
    },
  });

  const bankAccountIds = bankAccounts.map((a) => a.id);
  if (bankAccountIds.length === 0) {
    return NextResponse.json({ candidates: [] });
  }

  // Fetch unmatched journal entry lines on bank accounts within ±7 days
  const lineDate = new Date(bankLine.date);
  const searchStart = new Date(lineDate);
  searchStart.setDate(searchStart.getDate() - 7);
  const searchEnd = new Date(lineDate);
  searchEnd.setDate(searchEnd.getDate() + 7);

  const journalLines = await db.journalEntryLine.findMany({
    where: {
      accountId: { in: bankAccountIds },
      journalEntry: {
        userId,
        status: 'POSTED',
        cancelled: false,
        date: { gte: searchStart, lte: searchEnd },
      },
      bankMatches: { none: {} }, // Not already matched
    },
    include: {
      account: true,
      journalEntry: true,
    },
    orderBy: { journalEntry: { date: 'asc' } },
  });

  const candidates = journalLines
    .map((jl) => ({
      id: jl.id,
      date: jl.journalEntry.date.toISOString().split('T')[0],
      description: jl.journalEntry.description || jl.journalEntry.reference || '',
      accountNumber: jl.account.number,
      accountName: jl.account.name,
      debit: r(jl.debit || 0),
      credit: r(jl.credit || 0),
      amount: r(jl.debit > 0 ? -jl.debit : jl.credit), // Bank perspective
    }))
    .filter((c) => Math.abs(c.amount - bankLine.amount) < 1.0); // Within 1 DKK tolerance

  return NextResponse.json({ candidates });
}

// GET - List bank statements or get matching candidates
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    // Handle candidates action for manual matching
    if (action === 'candidates') {
      return getCandidates(request, user.id);
    }

    const statusFilter = searchParams.get('status') || 'all';

    const where: Record<string, unknown> = { userId: user.id };

    if (statusFilter === 'unmatched') {
      where.lines = {
        some: { reconciliationStatus: 'UNMATCHED' },
      };
    } else if (statusFilter === 'matched') {
      where.reconciled = true;
    }

    const statements = await db.bankStatement.findMany({
      where,
      orderBy: { startDate: 'desc' },
      include: {
        lines: {
          include: {
            matchedJournalLine: {
              include: {
                account: true,
                journalEntry: true,
              },
            },
          },
          orderBy: { date: 'asc' },
        },
      },
    });

    return NextResponse.json({ bankStatements: statements });
  } catch (error) {
    console.error('List bank statements error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Import a bank statement
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { bankAccount, lines, fileName } = body;

    if (!bankAccount || !lines || !Array.isArray(lines) || lines.length === 0) {
      return NextResponse.json(
        { error: 'Missing required fields: bankAccount and lines array' },
        { status: 400 }
      );
    }

    // Validate each line
    for (const line of lines) {
      if (!line.date || !line.description || typeof line.amount !== 'number') {
        return NextResponse.json(
          { error: 'Each line must have date (string), description (string), and amount (number)' },
          { status: 400 }
        );
      }
    }

    // Sort lines by date
    const sortedLines = [...lines].sort((a: { date: string }, b: { date: string }) =>
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    const startDate = new Date(sortedLines[0].date);
    const endDate = new Date(sortedLines[sortedLines.length - 1].date);
    const openingBalance = sortedLines[0].balance - sortedLines[0].amount;
    const closingBalance = sortedLines[sortedLines.length - 1].balance;

    // Fetch journal entry lines for the bank account for auto-matching
    const bankDemoFilter = await getDemoFilter(user.id);
    // Find the bank account by account group BANK or by account number matching the bankAccount identifier
    const bankAccounts = await db.account.findMany({
      where: {
        userId: user.id,
        group: 'BANK',
        isActive: true,
        ...bankDemoFilter,
      },
    });

    // Also try to match by account number if provided
    const matchedBankAccount = bankAccounts.find(
      (a) => a.number === bankAccount || a.name.toLowerCase().includes(bankAccount.toLowerCase())
    );

    // Fetch all journal entry lines on bank accounts for the statement period
    const statementStart = new Date(startDate);
    statementStart.setDate(statementStart.getDate() - 3); // -3 days for matching window
    const statementEnd = new Date(endDate);
    statementEnd.setDate(statementEnd.getDate() + 3); // +3 days for matching window

    const bankAccountIds = bankAccounts.map((a) => a.id);
    const journalLines = bankAccountIds.length > 0
      ? await db.journalEntryLine.findMany({
          where: {
            accountId: { in: bankAccountIds },
            journalEntry: {
              userId: user.id,
              status: 'POSTED',
              cancelled: false,
              date: {
                gte: statementStart,
                lte: statementEnd,
              },
            },
          },
          include: {
            account: true,
            journalEntry: true,
          },
        })
      : [];

    // Create the bank statement with lines
    const statement = await db.bankStatement.create({
      data: {
        bankAccount,
        startDate,
        endDate,
        openingBalance: Math.round(openingBalance * 100) / 100,
        closingBalance: Math.round(closingBalance * 100) / 100,
        fileName: fileName || null,
        userId: user.id,
        lines: {
          create: sortedLines.map((line: { date: string; description: string; reference?: string; amount: number; balance: number }) => ({
            date: new Date(line.date),
            description: line.description,
            reference: line.reference || null,
            amount: Math.round(line.amount * 100) / 100,
            balance: Math.round(line.balance * 100) / 100,
            reconciliationStatus: 'UNMATCHED',
          })),
        },
      },
      include: {
        lines: true,
      },
    });

    // Auto-match: match by exact amount ±0.01, within date range ±3 days
    let matchedCount = 0;
    const usedJournalLineIds = new Set<string>();

    for (const bankLine of statement.lines) {
      const bankLineDate = new Date(bankLine.date);
      let bestMatchId: string | null = null;

      for (const jl of journalLines) {
        // Skip already matched journal lines
        if (usedJournalLineIds.has(jl.id)) continue;

        const jlDate = new Date(jl.journalEntry.date);
        const daysDiff = Math.abs(bankLineDate.getTime() - jlDate.getTime()) / (1000 * 60 * 60 * 24);

        // Check date window ±3 days
        if (daysDiff > 3) continue;

        // Check amount match ±0.01
        // Journal line can be debit (money out of bank) or credit (money into bank)
        // Bank statement amount: positive = money in, negative = money out
        const journalAmount = jl.debit > 0 ? -jl.debit : jl.credit; // debit = out of bank, credit = into bank
        const amountDiff = Math.abs(Math.abs(bankLine.amount) - Math.abs(journalAmount));

        if (amountDiff <= 0.01) {
          bestMatchId = jl.id;
          break;
        }
      }

      if (bestMatchId) {
        usedJournalLineIds.add(bestMatchId);
        await db.bankStatementLine.update({
          where: { id: bankLine.id },
          data: {
            reconciliationStatus: 'MATCHED',
            matchedJournalLineId: bestMatchId,
            matchedAt: new Date(),
          },
        });
        matchedCount++;
      }
    }

    // Update statement reconciled status if all lines are matched
    const unmatchedCount = await db.bankStatementLine.count({
      where: {
        bankStatementId: statement.id,
        reconciliationStatus: 'UNMATCHED',
      },
    });

    if (unmatchedCount === 0 && statement.lines.length > 0) {
      await db.bankStatement.update({
        where: { id: statement.id },
        data: {
          reconciled: true,
          reconciledAt: new Date(),
        },
      });
    }

    // Re-fetch with relations for response
    const updatedStatement = await db.bankStatement.findUnique({
      where: { id: statement.id },
      include: {
        lines: {
          include: {
            matchedJournalLine: {
              include: {
                account: true,
                journalEntry: true,
              },
            },
          },
          orderBy: { date: 'asc' },
        },
      },
    });

    await auditCreate(
      user.id,
      'BankStatement',
      statement.id,
      {
        bankAccount,
        lineCount: lines.length,
        matchedCount,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      },
      requestMetadata(request)
    );

    return NextResponse.json(
      {
        bankStatement: updatedStatement,
        autoMatchResults: {
          totalLines: lines.length,
          matched: matchedCount,
          unmatched: lines.length - matchedCount,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Import bank statement error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT - Manual match/unmatch
export async function PUT(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { bankLineId, journalLineId, action } = body;

    if (!bankLineId || !action || !['match', 'unmatch'].includes(action)) {
      return NextResponse.json(
        { error: 'Missing required fields: bankLineId and action ("match" or "unmatch")' },
        { status: 400 }
      );
    }

    if (action === 'match' && !journalLineId) {
      return NextResponse.json(
        { error: 'journalLineId is required for match action' },
        { status: 400 }
      );
    }

    // Find the bank statement line and verify ownership
    const bankLine = await db.bankStatementLine.findUnique({
      where: { id: bankLineId },
      include: {
        bankStatement: true,
      },
    });

    if (!bankLine || bankLine.bankStatement.userId !== user.id) {
      return NextResponse.json(
        { error: 'Bank statement line not found' },
        { status: 404 }
      );
    }

    if (action === 'match') {
      // Verify the journal line exists and belongs to the user
      const journalLine = await db.journalEntryLine.findUnique({
        where: { id: journalLineId },
        include: {
          journalEntry: true,
        },
      });

      if (!journalLine || journalLine.journalEntry.userId !== user.id) {
        return NextResponse.json(
          { error: 'Journal entry line not found' },
          { status: 404 }
        );
      }

      const oldData = {
        reconciliationStatus: bankLine.reconciliationStatus,
        matchedJournalLineId: bankLine.matchedJournalLineId,
      };

      const updatedLine = await db.bankStatementLine.update({
        where: { id: bankLineId },
        data: {
          reconciliationStatus: 'MANUAL',
          matchedJournalLineId: journalLineId,
          matchedAt: new Date(),
        },
        include: {
          matchedJournalLine: {
            include: {
              account: true,
              journalEntry: true,
            },
          },
        },
      });

      await auditUpdate(
        user.id,
        'BankStatement',
        bankLine.bankStatementId,
        oldData,
        {
          reconciliationStatus: 'MANUAL',
          matchedJournalLineId: journalLineId,
        },
        { ...requestMetadata(request), bankLineId, journalLineId, action }
      );

      return NextResponse.json({ bankStatementLine: updatedLine });
    } else {
      // Unmatch
      const oldData = {
        reconciliationStatus: bankLine.reconciliationStatus,
        matchedJournalLineId: bankLine.matchedJournalLineId,
      };

      const updatedLine = await db.bankStatementLine.update({
        where: { id: bankLineId },
        data: {
          reconciliationStatus: 'UNMATCHED',
          matchedJournalLineId: null,
          matchedAt: null,
        },
        include: {
          matchedJournalLine: {
            include: {
              account: true,
              journalEntry: true,
            },
          },
        },
      });

      // If the statement was fully reconciled, mark it as unreconciled
      if (bankLine.bankStatement.reconciled) {
        await db.bankStatement.update({
          where: { id: bankLine.bankStatementId },
          data: {
            reconciled: false,
            reconciledAt: null,
          },
        });
      }

      await auditUpdate(
        user.id,
        'BankStatement',
        bankLine.bankStatementId,
        oldData,
        {
          reconciliationStatus: 'UNMATCHED',
          matchedJournalLineId: null,
        },
        { ...requestMetadata(request), bankLineId, action }
      );

      return NextResponse.json({ bankStatementLine: updatedLine });
    }
  } catch (error) {
    console.error('Bank reconciliation match error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
