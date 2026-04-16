import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/session';

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month');

    let whereClause: { userId: string; date?: { gte: Date; lte: Date }; cancelled?: boolean } = {
      userId: user.id,
      cancelled: false,
    };

    if (month) {
      const startDate = new Date(`${month}-01`);
      const endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + 1);
      endDate.setDate(0);
      whereClause.date = { gte: startDate, lte: endDate };
    }

    const [transactions, invoices] = await Promise.all([
      db.transaction.findMany({ where: whereClause, orderBy: { date: 'asc' } }),
      db.invoice.findMany({
        where: { userId: user.id, status: { not: 'CANCELLED' }, cancelled: false },
        orderBy: { issueDate: 'asc' },
      }),
    ]);

    const invoiceIdsWithTransactions = new Set(
      transactions.filter((t) => t.invoiceId).map((t) => t.invoiceId)
    );

    interface Entry {
      date: Date;
      type: string;
      amount: number;
      description: string;
      vatPercent: number;
      source: string;
    }

    const allEntries: Entry[] = [];

    for (const tx of transactions) {
      allEntries.push({
        date: tx.date, type: tx.type, amount: tx.amount,
        description: tx.description, vatPercent: tx.vatPercent, source: 'transaction',
      });
    }

    for (const invoice of invoices) {
      if (invoice.status === 'CANCELLED') continue;
      if (invoiceIdsWithTransactions.has(invoice.id)) continue;

      if (month) {
        const startDate = new Date(`${month}-01`);
        const endDate = new Date(startDate);
        endDate.setMonth(endDate.getMonth() + 1);
        endDate.setDate(0);
        if (invoice.issueDate < startDate || invoice.issueDate > endDate) continue;
      }

      try {
        const lineItems = JSON.parse(invoice.lineItems) as Array<{
          description: string; quantity: number; unitPrice: number; vatPercent: number;
        }>;

        for (const item of lineItems) {
          if (!item.description?.trim() || item.unitPrice <= 0) continue;
          const lineTotal = item.quantity * item.unitPrice;
          allEntries.push({
            date: invoice.issueDate, type: 'SALE', amount: lineTotal,
            description: `${invoice.invoiceNumber} - ${item.description}`,
            vatPercent: item.vatPercent, source: 'invoice',
          });
        }
      } catch {
        console.warn(`Could not parse lineItems for invoice ${invoice.id}`);
      }
    }

    allEntries.sort((a, b) => a.date.getTime() - b.date.getTime());

    const vatAmount = (amount: number, vatPercent: number) => (amount * vatPercent) / 100;

    const headers = ['Date', 'Type', 'Description', 'Net Amount (DKK)', 'VAT %', 'VAT Amount (DKK)', 'Gross Amount (DKK)', 'Source'];

    const rows = allEntries.map((e) => [
      e.date.toISOString().split('T')[0],
      e.type === 'PURCHASE' ? 'Purchase' : 'Sale',
      `"${e.description.replace(/"/g, '""')}"`,
      e.amount.toFixed(2), e.vatPercent.toFixed(1),
      vatAmount(e.amount, e.vatPercent).toFixed(2),
      (e.amount + vatAmount(e.amount, e.vatPercent)).toFixed(2),
      e.source,
    ]);

    const totalNet = allEntries.reduce((sum, e) => sum + e.amount, 0);
    const totalVAT = allEntries.reduce((sum, e) => sum + vatAmount(e.amount, e.vatPercent), 0);
    const outputVAT = allEntries.filter(e => e.type !== 'PURCHASE').reduce((sum, e) => sum + vatAmount(e.amount, e.vatPercent), 0);
    const inputVAT = allEntries.filter(e => e.type === 'PURCHASE').reduce((sum, e) => sum + vatAmount(e.amount, e.vatPercent), 0);

    rows.push([]);
    rows.push(['', 'TOTALS', '', '', '', '', '', '']);
    rows.push(['', 'Total Net Amount', totalNet.toFixed(2), '', '', '', '', '']);
    rows.push(['', 'Output VAT (Sales)', outputVAT.toFixed(2), '', '', '', '', '']);
    rows.push(['', 'Input VAT (Purchases)', inputVAT.toFixed(2), '', '', '', '', '']);
    rows.push(['', 'Net VAT (to pay/refund)', (outputVAT - inputVAT).toFixed(2), '', '', '', '', '']);
    rows.push(['', 'Total Gross (incl. VAT)', (totalNet + totalVAT).toFixed(2), '', '', '', '', '']);

    const csv = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
    const bom = '\uFEFF';

    return new NextResponse(bom + csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="transactions-${month || 'all'}.csv"`,
      },
    });
  } catch (error) {
    console.error('Export error:', error);
    return NextResponse.json({ error: 'Failed to export transactions' }, { status: 500 });
  }
}
