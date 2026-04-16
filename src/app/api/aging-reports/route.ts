import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/session';
import { AccountGroup } from '@prisma/client';

// Helper to round to 2 decimals
const r = (n: number) => Math.round(n * 100) / 100;

// Helper to compute days between two dates
function daysBetween(date1: Date, date2: Date): number {
  return Math.floor((date2.getTime() - date1.getTime()) / (1000 * 60 * 60 * 24));
}

// Format a Date to YYYY-MM-DD string
function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ─── Types ──────────────────────────────────────────────────────────

interface AgingEntry {
  journalEntryId: string;
  date: string;
  description: string;
  amount: number;
  daysOld: number;
}

interface AccountAging {
  accountId: string;
  accountNumber: string;
  accountName: string;
  current: number;
  days31to60: number;
  days61to90: number;
  days91to120: number;
  days120plus: number;
  total: number;
  entries: AgingEntry[];
}

interface AgingBucketSummary {
  current: number;
  days31to60: number;
  days61to90: number;
  days91to120: number;
  days120plus: number;
  total: number;
}

// ─── GET - Generate Aging Report ────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const asOfStr = searchParams.get('asOf');

    // Validate type parameter
    if (!type || (!['receivables', 'payables'].includes(type))) {
      return NextResponse.json(
        { error: 'Missing or invalid type parameter. Must be "receivables" or "payables".' },
        { status: 400 }
      );
    }

    // Determine asOf date (defaults to today)
    const asOf = asOfStr ? new Date(asOfStr) : new Date();
    asOf.setHours(23, 59, 59, 999);

    if (isNaN(asOf.getTime())) {
      return NextResponse.json(
        { error: 'Invalid asOf date format. Use YYYY-MM-DD.' },
        { status: 400 }
      );
    }

    if (type === 'receivables') {
      return generateReceivablesAging(user.id, asOf, asOfStr || formatDate(new Date()));
    } else {
      return generatePayablesAging(user.id, asOf, asOfStr || formatDate(new Date()));
    }
  } catch (error) {
    console.error('Aging reports error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ─── Receivables Aging (Debitorrapport) ─────────────────────────────

async function generateReceivablesAging(
  userId: string,
  asOf: Date,
  asOfStr: string
) {
  // Fetch all POSTED, non-cancelled journal entries up to asOf date
  // where lines are in RECEIVABLES group accounts
  const entries = await db.journalEntry.findMany({
    where: {
      userId,
      status: 'POSTED',
      cancelled: false,
      date: {
        lte: asOf,
      },
      lines: {
        some: {
          account: {
            group: AccountGroup.RECEIVABLES,
          },
        },
      },
    },
    include: {
      lines: {
        include: {
          account: true,
        },
        where: {
          account: {
            group: AccountGroup.RECEIVABLES,
          },
        },
      },
    },
    orderBy: { date: 'asc' },
  });

  // Build account aging data using NET balance per journal entry
  // (debit lines as invoices, credit lines as payments against receivables)
  const accountMap = new Map<string, AccountAging>();

  for (const entry of entries) {
    // Calculate net amount for this entry on receivables accounts
    let entryNetDebit = 0;
    let entryNetCredit = 0;
    let entryFirstDate: Date | null = null;
    let entryAccountInfo: { id: string; number: string; name: string } | null = null;

    for (const line of entry.lines) {
      if (line.account.group !== AccountGroup.RECEIVABLES) continue;
      entryNetDebit += line.debit || 0;
      entryNetCredit += line.credit || 0;
      if (!entryAccountInfo) {
        entryAccountInfo = { id: line.accountId, number: line.account.number, name: line.account.name };
      }
    }

    if (!entryAccountInfo) continue;

    // Net outstanding = debit - credit (positive means still owed)
    const netAmount = r(entryNetDebit - entryNetCredit);
    if (netAmount <= 0) continue; // Fully paid

    const entryDate = new Date(entry.date);
    const daysOld = daysBetween(entryDate, asOf);

    // Initialize account if not exists
    if (!accountMap.has(entryAccountInfo.id)) {
      accountMap.set(entryAccountInfo.id, {
        accountId: entryAccountInfo.id,
        accountNumber: entryAccountInfo.number,
        accountName: entryAccountInfo.name,
        current: 0,
        days31to60: 0,
        days61to90: 0,
        days91to120: 0,
        days120plus: 0,
        total: 0,
        entries: [],
      });
    }

    const accountAging = accountMap.get(entryAccountInfo.id)!;

    // Assign to aging bucket
    if (daysOld <= 30) {
      accountAging.current += netAmount;
    } else if (daysOld <= 60) {
      accountAging.days31to60 += netAmount;
    } else if (daysOld <= 90) {
      accountAging.days61to90 += netAmount;
    } else if (daysOld <= 120) {
      accountAging.days91to120 += netAmount;
    } else {
      accountAging.days120plus += netAmount;
    }

    accountAging.total += netAmount;

    // Add individual entry
    accountAging.entries.push({
      journalEntryId: entry.id,
      date: formatDate(entryDate),
      description: entry.description || entry.reference || '',
      amount: netAmount,
      daysOld,
    });
  }

  // Build summary
  const summary: AgingBucketSummary = {
    current: 0,
    days31to60: 0,
    days61to90: 0,
    days91to120: 0,
    days120plus: 0,
    total: 0,
  };

  const accounts: AccountAging[] = [];

  for (const [, acc] of accountMap) {
    acc.current = r(acc.current);
    acc.days31to60 = r(acc.days31to60);
    acc.days61to90 = r(acc.days61to90);
    acc.days91to120 = r(acc.days91to120);
    acc.days120plus = r(acc.days120plus);
    acc.total = r(acc.total);

    // Only include accounts with a balance
    if (acc.total > 0) {
      accounts.push(acc);
      summary.current += acc.current;
      summary.days31to60 += acc.days31to60;
      summary.days61to90 += acc.days61to90;
      summary.days91to120 += acc.days91to120;
      summary.days120plus += acc.days120plus;
      summary.total += acc.total;
    }
  }

  // Round summary totals
  summary.current = r(summary.current);
  summary.days31to60 = r(summary.days31to60);
  summary.days61to90 = r(summary.days61to90);
  summary.days91to120 = r(summary.days91to120);
  summary.days120plus = r(summary.days120plus);
  summary.total = r(summary.total);

  // Sort accounts by number
  accounts.sort((a, b) => a.accountNumber.localeCompare(b.accountNumber));

  return NextResponse.json({
    type: 'receivables',
    asOf: asOfStr,
    summary,
    accounts,
  });
}

// ─── Payables Aging (Kreditorrapport) ───────────────────────────────

async function generatePayablesAging(
  userId: string,
  asOf: Date,
  asOfStr: string
) {
  // Fetch all POSTED, non-cancelled journal entries up to asOf date
  // where lines are in PAYABLES group accounts
  const entries = await db.journalEntry.findMany({
    where: {
      userId,
      status: 'POSTED',
      cancelled: false,
      date: {
        lte: asOf,
      },
      lines: {
        some: {
          account: {
            group: AccountGroup.PAYABLES,
          },
        },
      },
    },
    include: {
      lines: {
        include: {
          account: true,
        },
        where: {
          account: {
            group: AccountGroup.PAYABLES,
          },
        },
      },
    },
    orderBy: { date: 'asc' },
  });

  // Build account aging data using NET balance per journal entry
  // (credit lines as purchase invoices, debit lines as payments against payables)
  const accountMap = new Map<string, AccountAging>();

  for (const entry of entries) {
    // Calculate net amount for this entry on payables accounts
    let entryNetDebit = 0;
    let entryNetCredit = 0;
    let entryAccountInfo: { id: string; number: string; name: string } | null = null;

    for (const line of entry.lines) {
      if (line.account.group !== AccountGroup.PAYABLES) continue;
      entryNetDebit += line.debit || 0;
      entryNetCredit += line.credit || 0;
      if (!entryAccountInfo) {
        entryAccountInfo = { id: line.accountId, number: line.account.number, name: line.account.name };
      }
    }

    if (!entryAccountInfo) continue;

    // Net outstanding = credit - debit (positive means still owed to supplier)
    const netAmount = r(entryNetCredit - entryNetDebit);
    if (netAmount <= 0) continue; // Fully paid

    const entryDate = new Date(entry.date);
    const daysOld = daysBetween(entryDate, asOf);

    // Initialize account if not exists
    if (!accountMap.has(entryAccountInfo.id)) {
      accountMap.set(entryAccountInfo.id, {
        accountId: entryAccountInfo.id,
        accountNumber: entryAccountInfo.number,
        accountName: entryAccountInfo.name,
        current: 0,
        days31to60: 0,
        days61to90: 0,
        days91to120: 0,
        days120plus: 0,
        total: 0,
        entries: [],
      });
    }

    const accountAging = accountMap.get(entryAccountInfo.id)!;

    // Assign to aging bucket
    if (daysOld <= 30) {
      accountAging.current += netAmount;
    } else if (daysOld <= 60) {
      accountAging.days31to60 += netAmount;
    } else if (daysOld <= 90) {
      accountAging.days61to90 += netAmount;
    } else if (daysOld <= 120) {
      accountAging.days91to120 += netAmount;
    } else {
      accountAging.days120plus += netAmount;
    }

    accountAging.total += netAmount;

    // Add individual entry
    accountAging.entries.push({
      journalEntryId: entry.id,
      date: formatDate(entryDate),
      description: entry.description || entry.reference || '',
      amount: netAmount,
      daysOld,
    });
  }

  // Build summary
  const summary: AgingBucketSummary = {
    current: 0,
    days31to60: 0,
    days61to90: 0,
    days91to120: 0,
    days120plus: 0,
    total: 0,
  };

  const accounts: AccountAging[] = [];

  for (const [, acc] of accountMap) {
    acc.current = r(acc.current);
    acc.days31to60 = r(acc.days31to60);
    acc.days61to90 = r(acc.days61to90);
    acc.days91to120 = r(acc.days91to120);
    acc.days120plus = r(acc.days120plus);
    acc.total = r(acc.total);

    // Only include accounts with a balance
    if (acc.total > 0) {
      accounts.push(acc);
      summary.current += acc.current;
      summary.days31to60 += acc.days31to60;
      summary.days61to90 += acc.days61to90;
      summary.days91to120 += acc.days91to120;
      summary.days120plus += acc.days120plus;
      summary.total += acc.total;
    }
  }

  // Round summary totals
  summary.current = r(summary.current);
  summary.days31to60 = r(summary.days31to60);
  summary.days61to90 = r(summary.days61to90);
  summary.days91to120 = r(summary.days91to120);
  summary.days120plus = r(summary.days120plus);
  summary.total = r(summary.total);

  // Sort accounts by number
  accounts.sort((a, b) => a.accountNumber.localeCompare(b.accountNumber));

  return NextResponse.json({
    type: 'payables',
    asOf: asOfStr,
    summary,
    accounts,
  });
}
