import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/session';
import { getDemoFilter } from '@/lib/demo-filter';
import { generateInvoicePDF } from '@/lib/pdf-generator';

// GET /api/invoices/[id]/pdf - Download invoice as PDF
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
    const demoFilter = await getDemoFilter(user.id);

    // Fetch invoice with company info
    const invoice = await db.invoice.findFirst({
      where: { id, userId: user.id },
      include: {
        user: {
          select: {
            companyInfo: {
              where: { ...demoFilter },
              take: 1,
            },
          },
        },
      },
    });

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    const ci = invoice.user.companyInfo[0] || null;

    // Build the InvoiceWithDetails object
    const invoiceWithDetails = {
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      customerName: invoice.customerName,
      customerAddress: invoice.customerAddress,
      customerEmail: invoice.customerEmail,
      customerPhone: invoice.customerPhone,
      customerCvr: invoice.customerCvr,
      issueDate: invoice.issueDate,
      dueDate: invoice.dueDate,
      lineItems: invoice.lineItems,
      subtotal: invoice.subtotal,
      vatTotal: invoice.vatTotal,
      total: invoice.total,
      currency: invoice.currency || 'DKK',
      exchangeRate: invoice.exchangeRate,
      status: invoice.status,
      notes: invoice.notes,
      companyInfo: ci
        ? {
            logo: ci.logo,
            companyName: ci.companyName,
            address: ci.address,
            phone: ci.phone,
            email: ci.email,
            cvrNumber: ci.cvrNumber,
            bankName: ci.bankName,
            bankAccount: ci.bankAccount,
            bankRegistration: ci.bankRegistration,
            bankIban: ci.bankIban,
            invoiceTerms: ci.invoiceTerms,
          }
        : null,
    };

    // Generate PDF
    const pdfBytes = await generateInvoicePDF(invoiceWithDetails);

    // Create filename: faktura-{invoiceNumber}.pdf
    // Clean invoice number (remove # prefix, replace special chars)
    const cleanNumber = invoice.invoiceNumber.replace(/^#/, '').replace(/[^a-zA-Z0-9\-]/g, '_');
    const filename = `faktura-${cleanNumber}.pdf`;

    // Return PDF response
    return new NextResponse(pdfBytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
        'Content-Length': pdfBytes.length.toString(),
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  } catch (error) {
    console.error('[PDF] Failed to generate invoice PDF:', error);
    return NextResponse.json(
      { error: 'Failed to generate PDF' },
      { status: 500 }
    );
  }
}
