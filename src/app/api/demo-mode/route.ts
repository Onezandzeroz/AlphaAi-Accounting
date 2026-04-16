import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/session';
import { seedDemoData } from '@/app/api/demo-seed/route';
import { seedChartOfAccounts } from '@/lib/seed-chart-of-accounts';

// ─── GET: Check demo mode status ──────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const [dbUser, demoTransactionCount] = await Promise.all([
      db.user.findUnique({
        where: { id: user.id },
        select: { demoModeEnabled: true },
      }),
      db.transaction.count({
        where: { userId: user.id, isDemo: true },
      }),
    ]);

    return NextResponse.json({
      demoModeEnabled: dbUser?.demoModeEnabled ?? false,
      hasDemoData: demoTransactionCount > 0,
    });
  } catch (error) {
    console.error('[Demo Mode GET] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ─── POST: Toggle demo mode (enter / exit) ────────────────────────

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { action } = body as { action: 'enter' | 'exit' };

    if (action !== 'enter' && action !== 'exit') {
      return NextResponse.json(
        { error: 'Invalid action. Must be "enter" or "exit".' },
        { status: 400 }
      );
    }

    if (action === 'enter') {
      // ── Enter demo mode ──
      const demoTransactionCount = await db.transaction.count({
        where: { userId: user.id, isDemo: true },
      });

      // Seed demo data if it doesn't exist yet
      if (demoTransactionCount === 0) {
        await seedDemoData(user.id);
      } else {
        // Just enable the flag
        await db.user.update({
          where: { id: user.id },
          data: { demoModeEnabled: true },
        });
      }

      return NextResponse.json({
        message: 'Demo mode enabled',
        demoModeEnabled: true,
      });
    }

    // ── Exit demo mode — delete all demo data ──
    const userId = user.id;

    // 1. Delete journal entries (cascade deletes JournalEntryLine and Document)
    const deletedJournalEntries = await db.journalEntry.deleteMany({
      where: { userId, isDemo: true },
    });

    // 2. Delete invoices (sets invoiceId to null on linked Transactions via onDelete: SetNull)
    const deletedInvoices = await db.invoice.deleteMany({
      where: { userId, isDemo: true },
    });

    // 3. Delete demo transactions
    const deletedTransactions = await db.transaction.deleteMany({
      where: { userId, isDemo: true },
    });

    // 4. Delete demo contacts
    const deletedContacts = await db.contact.deleteMany({
      where: { userId, isDemo: true },
    });

    // 5. Delete demo company info (only the isDemo one)
    const deletedCompanyInfo = await db.companyInfo.deleteMany({
      where: { userId, isDemo: true },
    });

    // 6. Delete demo chart of accounts
    const deletedAccounts = await db.account.deleteMany({
      where: { userId, isDemo: true },
    });

    // 7. Seed live chart of accounts if the user has no live accounts
    const liveAccountCount = await db.account.count({
      where: { userId, isDemo: false },
    });
    if (liveAccountCount === 0) {
      await seedChartOfAccounts(userId, false);
    }

    // 8. Delete demo fiscal periods
    const deletedFiscalPeriods = await db.fiscalPeriod.deleteMany({
      where: { userId, isDemo: true },
    });

    // 9. Delete demo recurring entries
    const deletedRecurringEntries = await db.recurringEntry.deleteMany({
      where: { userId, isDemo: true },
    });

    // 10. Delete demo budgets (cascade deletes BudgetEntry)
    const deletedBudgets = await db.budget.deleteMany({
      where: { userId, isDemo: true },
    });

    // 11. Disable demo mode
    await db.user.update({
      where: { id: userId },
      data: { demoModeEnabled: false },
    });

    return NextResponse.json({
      message: 'Demo mode exited. All demo data deleted.',
      demoModeEnabled: false,
      deleted: {
        journalEntries: deletedJournalEntries.count,
        invoices: deletedInvoices.count,
        transactions: deletedTransactions.count,
        contacts: deletedContacts.count,
        companyInfo: deletedCompanyInfo.count,
        accounts: deletedAccounts.count,
        fiscalPeriods: deletedFiscalPeriods.count,
        recurringEntries: deletedRecurringEntries.count,
        budgets: deletedBudgets.count,
      },
    });
  } catch (error) {
    console.error('[Demo Mode POST] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
