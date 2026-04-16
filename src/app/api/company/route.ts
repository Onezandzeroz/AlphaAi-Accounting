import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/session';
import { auditCreate, auditUpdate, auditLog, requestMetadata } from '@/lib/audit';
import { getDemoFilter } from '@/lib/demo-filter';

// GET /api/company - Get company info
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get demo mode filter — only return company info matching the current mode
    const demoFilter = await getDemoFilter(user.id);

    const companyInfo = await db.companyInfo.findFirst({
      where: { userId: user.id, ...demoFilter },
    });

    return NextResponse.json({ companyInfo });
  } catch (error) {
    console.error('Failed to fetch company info:', error);
    return NextResponse.json({ error: 'Failed to fetch company info' }, { status: 500 });
  }
}

// POST /api/company - Create company info
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const demoFilter = await getDemoFilter(user.id);

    const body = await request.json();
    const {
      logo, companyName, address, phone, email, cvrNumber, invoicePrefix,
      bankName, bankAccount, bankRegistration, bankIban, bankStreet, bankCity,
      bankCountry, invoiceTerms,
    } = body;

    if (!companyName || !address || !phone || !email || !cvrNumber || !invoicePrefix || !bankName || !bankAccount || !bankRegistration) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const currentYear = new Date().getFullYear();

    const companyInfo = await db.companyInfo.create({
      data: {
        logo: logo || null, companyName, address, phone, email, cvrNumber,
        invoicePrefix: invoicePrefix.toUpperCase(), bankName, bankAccount,
        bankRegistration, bankIban: bankIban || null, bankStreet: bankStreet || null,
        bankCity: bankCity || null, bankCountry: bankCountry || null,
        invoiceTerms: invoiceTerms || null, nextInvoiceSequence: 1, currentYear,
        userId: user.id,
        isDemo: demoFilter.isDemo,
      },
    });

    await auditCreate(user.id, 'CompanyInfo', companyInfo.id, { companyName, cvrNumber }, requestMetadata(request));

    return NextResponse.json({ companyInfo }, { status: 201 });
  } catch (error) {
    console.error('Failed to create company info:', error);
    return NextResponse.json({ error: 'Failed to create company info' }, { status: 500 });
  }
}

// PUT /api/company - Update company info
export async function PUT(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const demoFilter = await getDemoFilter(user.id);

    const body = await request.json();
    const {
      logo, companyName, address, phone, email, cvrNumber, invoicePrefix,
      bankName, bankAccount, bankRegistration, bankIban, bankStreet, bankCity,
      bankCountry, invoiceTerms,
    } = body;

    const existing = await db.companyInfo.findFirst({
      where: { userId: user.id, ...demoFilter },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Company info not found' }, { status: 404 });
    }

    // Build old data snapshot for audit
    const oldData: Record<string, unknown> = { companyName: existing.companyName, cvrNumber: existing.cvrNumber };

    const companyInfo = await db.companyInfo.update({
      where: { id: existing.id },
      data: {
        ...(logo !== undefined && { logo }),
        ...(companyName && { companyName }),
        ...(address && { address }),
        ...(phone && { phone }),
        ...(email && { email }),
        ...(cvrNumber && { cvrNumber }),
        ...(invoicePrefix && { invoicePrefix: invoicePrefix.toUpperCase() }),
        ...(bankName && { bankName }),
        ...(bankAccount && { bankAccount }),
        ...(bankRegistration && { bankRegistration }),
        ...(bankIban !== undefined && { bankIban }),
        ...(bankStreet !== undefined && { bankStreet }),
        ...(bankCity !== undefined && { bankCity }),
        ...(bankCountry !== undefined && { bankCountry }),
        ...(invoiceTerms !== undefined && { invoiceTerms }),
      },
    });

    const newData: Record<string, unknown> = { companyName: companyInfo.companyName, cvrNumber: companyInfo.cvrNumber };
    await auditUpdate(user.id, 'CompanyInfo', existing.id, oldData, newData, requestMetadata(request));

    return NextResponse.json({ companyInfo });
  } catch (error) {
    console.error('Failed to update company info:', error);
    return NextResponse.json({ error: 'Failed to update company info' }, { status: 500 });
  }
}

// DELETE /api/company - Reset all data (with audit trail)
export async function DELETE(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Audit the data reset BEFORE it happens
    await auditLog({
      action: 'DATA_RESET',
      entityType: 'System',
      entityId: user.id,
      userId: user.id,
      metadata: requestMetadata(request),
    });

    // Cancel all transactions (soft-delete)
    await db.transaction.updateMany({
      where: { userId: user.id, cancelled: false },
      data: { cancelled: true, cancelReason: 'Full data reset by user' },
    });

    // Cancel all invoices (soft-delete)
    await db.invoice.updateMany({
      where: { userId: user.id, cancelled: false },
      data: { cancelled: true, cancelReason: 'Full data reset by user', status: 'CANCELLED' },
    });

    // Delete company info (it's config, not accounting data)
    await db.companyInfo.deleteMany({ where: { userId: user.id } });

    return NextResponse.json({ success: true, message: 'All data cleared successfully' });
  } catch (error) {
    console.error('Failed to clear data:', error);
    return NextResponse.json({ error: 'Failed to clear data' }, { status: 500 });
  }
}
