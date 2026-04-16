import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/session';
import { auditUpdate, auditCreate, requestMetadata } from '@/lib/audit';

// GET /api/invoices/[id] - Get a specific invoice
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const invoice = await db.invoice.findFirst({
      where: { id, userId: user.id },
    });

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    return NextResponse.json({ invoice });
  } catch (error) {
    console.error('Failed to fetch invoice:', error);
    return NextResponse.json({ error: 'Failed to fetch invoice' }, { status: 500 });
  }
}

// PUT /api/invoices/[id] - Update invoice (e.g., change status) — with audit trail
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();

    const existing = await db.invoice.findFirst({
      where: { id, userId: user.id },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    const previousStatus = existing.status;
    const newStatus = body.status;

    // Build old/new data for audit
    const oldData: Record<string, unknown> = { status: previousStatus, notes: existing.notes };
    const newData: Record<string, unknown> = {};
    if (newStatus) newData.status = newStatus;
    if (body.notes !== undefined) newData.notes = body.notes;
    if (body.customerName) newData.customerName = body.customerName;
    if (body.customerAddress !== undefined) newData.customerAddress = body.customerAddress;
    if (body.customerEmail !== undefined) newData.customerEmail = body.customerEmail;
    if (body.customerPhone !== undefined) newData.customerPhone = body.customerPhone;
    if (body.customerCvr !== undefined) newData.customerCvr = body.customerCvr;

    // Update the invoice
    const invoice = await db.invoice.update({
      where: { id },
      data: {
        ...(newStatus && { status: newStatus }),
        ...(body.notes !== undefined && { notes: body.notes }),
        ...(body.customerName && { customerName: body.customerName }),
        ...(body.customerAddress !== undefined && { customerAddress: body.customerAddress }),
        ...(body.customerEmail !== undefined && { customerEmail: body.customerEmail }),
        ...(body.customerPhone !== undefined && { customerPhone: body.customerPhone }),
        ...(body.customerCvr !== undefined && { customerCvr: body.customerCvr }),
      },
    });

    // Audit log
    await auditUpdate(user.id, 'Invoice', id, oldData, newData, requestMetadata(request));

    // When invoice is marked as PAID, create transactions from line items
    if (newStatus === 'PAID' && previousStatus !== 'PAID') {
      const existingTransactions = await db.transaction.findMany({
        where: { invoiceId: id },
      });

      if (existingTransactions.length === 0) {
        const lineItems = JSON.parse(existing.lineItems) as Array<{
          description: string;
          quantity: number;
          unitPrice: number;
          vatPercent: number;
        }>;

        for (const item of lineItems) {
          if (!item.description.trim() || item.unitPrice <= 0) continue;

          const lineTotal = item.quantity * item.unitPrice;

          const tx = await db.transaction.create({
            data: {
              date: existing.issueDate,
              type: 'SALE',
              amount: lineTotal,
              description: `${existing.invoiceNumber} - ${item.description}`,
              vatPercent: item.vatPercent,
              invoiceId: id,
              userId: user.id,
            },
          });

          // Audit each auto-created transaction
          await auditCreate(
            user.id,
            'Transaction',
            tx.id,
            { autoCreated: true, invoiceId: id, description: tx.description, amount: tx.amount },
            { source: 'invoice_payment' }
          );
        }
      }
    }

    // When invoice is changed FROM PAID, cancel the linked transactions
    if (previousStatus === 'PAID' && newStatus && newStatus !== 'PAID') {
      const linkedTx = await db.transaction.findMany({
        where: { invoiceId: id, cancelled: false },
      });

      for (const tx of linkedTx) {
        await db.transaction.update({
          where: { id: tx.id },
          data: { cancelled: true, cancelReason: `Invoice ${existing.invoiceNumber} status changed from PAID to ${newStatus}` },
        });
      }
    }

    return NextResponse.json({ invoice });
  } catch (error) {
    console.error('Failed to update invoice:', error);
    return NextResponse.json({ error: 'Failed to update invoice' }, { status: 500 });
  }
}
