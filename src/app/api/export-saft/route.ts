import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/session';
import { create } from 'xmlbuilder2';
import { 
  validateSAFT, 
  validateTransactionData, 
  logValidationResults 
} from '@/lib/saft-validator';

// Danish SAF-T export endpoint
// Based on SAF-T Financial schema version 1.0 (Danish Tax Authority - Skattestyrelsen)

interface ValidationError {
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

interface MergedTransaction {
  id: string;
  date: Date;
  type: 'SALE' | 'PURCHASE';
  amount: number;
  description: string;
  vatPercent: number;
  receiptImage: string | null;
  createdAt: Date;
  source: 'transaction' | 'invoice';
}

function mapVatCode(vatPercent: number): { code: string; description: string } {
  // Danish VAT codes mapping according to SAF-T DK specification
  switch (vatPercent) {
    case 25:
      return { code: 'I1', description: 'Standard rate (25%)' };
    case 0:
      return { code: 'I3', description: 'Zero rate' };
    default:
      return { code: 'I1', description: `VAT ${vatPercent}%` };
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = user.id;

    // Get period from query params
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month'); // Expected format: YYYY-MM
    const startDate = searchParams.get('startDate'); // Alternative: date range
    const endDate = searchParams.get('endDate');

    let periodStart: Date;
    let periodEnd: Date;

    if (month) {
      // Parse month format (YYYY-MM)
      const [year, monthNum] = month.split('-').map(Number);
      periodStart = new Date(year, monthNum - 1, 1);
      periodEnd = new Date(year, monthNum, 0, 23, 59, 59, 999);
    } else if (startDate && endDate) {
      periodStart = new Date(startDate);
      periodEnd = new Date(endDate);
      periodEnd.setHours(23, 59, 59, 999);
    } else {
      // Default to current month
      const now = new Date();
      periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    }

    // Fetch user with transactions AND invoices for the period
    const demoFilterVal = await db.user.findUnique({
      where: { id: userId },
      select: { demoModeEnabled: true },
    });
    const isDemo = demoFilterVal?.demoModeEnabled ?? false;

    const userData = await db.user.findUnique({
      where: { id: userId },
      include: {
        transactions: {
          where: {
            date: {
              gte: periodStart,
              lte: periodEnd,
            },
            cancelled: false,
          },
          orderBy: { date: 'asc' },
        },
        invoices: {
          where: {
            status: { not: 'CANCELLED' },
          },
          orderBy: { issueDate: 'asc' },
        },
        companyInfos: {
          where: { isDemo },
          take: 1,
        },
      },
    });

    if (!userData) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Collect IDs of invoices that already have transactions (to avoid double-counting)
    const invoiceIdsWithTransactions = new Set(
      userData.transactions
        .filter((t) => t.invoiceId)
        .map((t) => t.invoiceId)
    );

    // Build merged list of all transactions including virtual ones from invoices
    const allEntries: MergedTransaction[] = [];

    // Add real transactions
    for (const tx of userData.transactions) {
      allEntries.push({
        id: tx.id,
        date: tx.date,
        type: tx.type as 'SALE' | 'PURCHASE',
        amount: tx.amount,
        description: tx.description,
        vatPercent: tx.vatPercent,
        receiptImage: tx.receiptImage,
        createdAt: tx.createdAt,
        source: 'transaction',
      });
    }

    // Add virtual transactions from invoices without existing transactions
    for (const invoice of userData.invoices) {
      if (invoice.status === 'CANCELLED' || invoice.status === 'DRAFT') continue;
      if (invoiceIdsWithTransactions.has(invoice.id)) continue;

      // Filter invoices by period
      if (invoice.issueDate < periodStart || invoice.issueDate > periodEnd) continue;

      try {
        const lineItems = JSON.parse(invoice.lineItems) as Array<{
          description: string;
          quantity: number;
          unitPrice: number;
          vatPercent: number;
        }>;

        for (const item of lineItems) {
          if (!item.description?.trim() || item.unitPrice <= 0) continue;
          const lineTotal = item.quantity * item.unitPrice;

          allEntries.push({
            id: `inv-${invoice.id}-${item.description.slice(0, 20).replace(/\s+/g, '-')}`,
            date: invoice.issueDate,
            type: 'SALE',
            amount: lineTotal,
            description: `${invoice.invoiceNumber} - ${item.description}`,
            vatPercent: item.vatPercent,
            receiptImage: null,
            createdAt: invoice.createdAt,
            source: 'invoice',
          });
        }
      } catch {
        console.warn(`[SAF-T Export] Could not parse lineItems for invoice ${invoice.id}`);
      }
    }

    const transactions = allEntries;
    
    // ========================================
    // STEP 1: Validate Transaction Data
    // ========================================
    console.log(`[SAF-T Export] Processing ${transactions.length} entries for period ${month || 'custom'} (includes ${transactions.filter(t => t.source === 'invoice').length} from invoices)`);
    
    const dataValidation = validateTransactionData(
      transactions.map(t => ({
        id: t.id,
        date: t.date,
        amount: t.amount,
        description: t.description,
        vatPercent: t.vatPercent,
      }))
    );

    // Log data validation results
    if (dataValidation.errors.length > 0) {
      console.error('[SAF-T Export] Data validation errors:', dataValidation.errors);
    }
    if (dataValidation.warnings.length > 0) {
      console.warn('[SAF-T Export] Data validation warnings:', dataValidation.warnings);
    }

    // Allow export even with warnings, but not with critical errors
    if (!dataValidation.valid && dataValidation.errors.length > 0) {
      return NextResponse.json({
        error: 'Transaction data validation failed',
        details: dataValidation.errors.join('; '),
        warnings: dataValidation.warnings,
      }, { status: 400 });
    }

    // Separate sales and purchases
    const salesEntries = transactions.filter(t => t.type === 'SALE' || !t.type);
    const purchaseEntries = transactions.filter(t => t.type === 'PURCHASE');

    // Calculate totals
    const totalSalesAmount = salesEntries.reduce((sum, t) => sum + t.amount, 0);
    const totalPurchaseAmount = purchaseEntries.reduce((sum, t) => sum + t.amount, 0);
    const totalAmount = totalSalesAmount + totalPurchaseAmount;
    const outputVAT = salesEntries.reduce((sum, t) => sum + (t.amount * t.vatPercent) / 100, 0);
    const inputVAT = purchaseEntries.reduce((sum, t) => sum + (t.amount * t.vatPercent) / 100, 0);
    const totalVAT = outputVAT + inputVAT;
    const totalIncludingVAT = totalAmount + totalVAT;

    // Group by VAT rate for totals
    const vatBreakdown = transactions.reduce((acc, t) => {
      const rate = t.vatPercent;
      if (!acc[rate]) {
        acc[rate] = { amount: 0, vat: 0 };
      }
      acc[rate].amount += t.amount;
      acc[rate].vat += (t.amount * t.vatPercent) / 100;
      return acc;
    }, {} as Record<number, { amount: number; vat: number }>);

    // ========================================
    // Generate company info from CompanyInfo model
    // ========================================
    const companyInfo = userData.companyInfos[0] || null;
    const companyName = companyInfo?.companyName || userData.businessName || user.email.split('@')[0];
    const companyCVR = companyInfo?.cvrNumber || 'DK' + userId.substring(0, 8).toUpperCase();
    const companyAddress = companyInfo?.address || '';
    const companyEmail = companyInfo?.email || user.email;
    const companyPhone = companyInfo?.phone || '';

    // ========================================
    // STEP 2: Build SAF-T XML
    // ========================================
    console.log('[SAF-T Export] Building XML structure...');
    
    const formatDate = (date: Date) => date.toISOString().substring(0, 10);
    const formatDateTime = (date: Date) => date.toISOString();
    const formatNumber = (num: number) => num.toFixed(2);

    // Create XML document with proper namespace
    const doc = create({ version: '1.0', encoding: 'UTF-8' });

    const root = doc.ele('AuditFile', {
      'xmlns': 'urn:Oasis/Tax/Accounting/SAF-T/Financial/DK',
      'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
      'xsi:schemaLocation': 'urn:Oasis/Tax/Accounting/SAF-T/Financial/DK Danish_SAF-T_Financial_Schema_v1.0.xsd',
    });

    // 1. Header - MANDATORY
    const header = root.ele('Header');
    header.ele('AuditFileVersion').txt('1.0');
    header.ele('AuditFileCountry').txt('DK');
    header.ele('AuditFileDateCreated').txt(formatDateTime(new Date()));
    header.ele('SoftwareCompanyName').txt('AlphaAi Accounting');
    header.ele('SoftwareID').txt('AlphaAi Accounting v1.0');
    header.ele('SoftwareVersion').txt('1.0.0');
    header.ele('CompanyID').txt(companyCVR);
    header.ele('TaxRegistrationNumber').txt(companyCVR);
    
    const company = header.ele('Company');
    company.ele('RegistrationNumber').txt(companyCVR);
    company.ele('Name').txt(companyName);
    
    if (companyAddress) {
      const companyAddressNode = company.ele('Address');
      companyAddressNode.ele('StreetName').txt(companyAddress);
      companyAddressNode.ele('Country').txt('DK');
    } else {
      const companyAddressNode = company.ele('Address');
      companyAddressNode.ele('Country').txt('DK');
    }

    if (companyEmail) {
      header.ele('EmailAddress').txt(companyEmail);
    }
    if (companyPhone) {
      header.ele('TelephoneNumber').txt(companyPhone);
    }
    
    const period = header.ele('SelectionCriteria');
    period.ele('PeriodStart').txt(formatDate(periodStart));
    period.ele('PeriodEnd').txt(formatDate(periodEnd));
    
    header.ele('HeaderComment').txt('SAF-T export generated by AlphaAi Accounting');

    // 2. MasterFiles - MANDATORY
    const masterFiles = root.ele('MasterFiles');

    // General ledger accounts - MANDATORY
    const generalLedgerAccounts = masterFiles.ele('GeneralLedgerAccounts');
    
    // Standard Danish chart of accounts (simplified)
    const accounts = [
      { id: '3000', name: 'Salgsindtægter', type: 'OT', description: 'Revenue/Sales' },
      { id: '5500', name: 'Moms af salg', type: 'OT', description: 'VAT on sales (output VAT)' },
      { id: '5600', name: 'Moms af køb', type: 'OT', description: 'VAT on purchases (input VAT)' },
      { id: '6000', name: 'Lønomkostninger', type: 'EX', description: 'Personnel expenses' },
      { id: '7000', name: 'Øvrige driftsomkostninger', type: 'EX', description: 'Other operating expenses' },
    ];

    accounts.forEach(acc => {
      const account = generalLedgerAccounts.ele('Account');
      account.ele('AccountID').txt(acc.id);
      account.ele('AccountDescription').txt(acc.name);
      account.ele('AccountType').txt(acc.type);
    });

    // Tax code table - MANDATORY
    const taxCodeTable = masterFiles.ele('TaxCodeTable');
    const uniqueVatRates = new Set(transactions.map(t => t.vatPercent));
    
    // Always add standard Danish VAT codes
    if (!uniqueVatRates.has(25)) {
      const standardCode = taxCodeTable.ele('TaxCode');
      standardCode.ele('TaxCode').txt('I1');
      standardCode.ele('Description').txt('Standard rate (25%)');
      standardCode.ele('TaxPercentage').txt('25');
      standardCode.ele('Country').txt('DK');
    }
    
    uniqueVatRates.forEach(rate => {
      const vatInfo = mapVatCode(rate);
      const taxCode = taxCodeTable.ele('TaxCode');
      taxCode.ele('TaxCode').txt(vatInfo.code);
      taxCode.ele('Description').txt(vatInfo.description);
      taxCode.ele('TaxPercentage').txt(rate.toString());
      taxCode.ele('Country').txt('DK');
    });

    // Customers - OPTIONAL but included for completeness
    const customers = masterFiles.ele('Customers');
    const customer = customers.ele('Customer');
    customer.ele('CustomerID').txt('CUST-001');
    customer.ele('CustomerTaxID').txt('DK00000000');
    customer.ele('CompanyName').txt('General Customers');

    // 3. GeneralLedgerEntries - OPTIONAL but recommended
    if (transactions.length > 0) {
      const generalLedgerEntries = root.ele('GeneralLedgerEntries');
      
      // Sales journal
      if (salesEntries.length > 0) {
        const salesJournal = generalLedgerEntries.ele('Journal');
        salesJournal.ele('JournalID').txt('SALES');
        salesJournal.ele('Description').txt('Sales journal');
        salesJournal.ele('Type').txt('SL');

        salesEntries.forEach((transaction) => {
          const entry = salesJournal.ele('Transaction');
          entry.ele('TransactionID').txt(transaction.id);
          entry.ele('TransactionDate').txt(formatDate(new Date(transaction.date)));
          entry.ele('SourceDocumentID').txt(`SD-${transaction.id}`);
          
          const lines = entry.ele('Lines');
          
          // Line 1: Revenue
          const line1 = lines.ele('Line');
          line1.ele('RecordID').txt(`${transaction.id}-1`);
          line1.ele('AccountID').txt('3000');
          line1.ele('Description').txt(transaction.description);
          line1.ele('DebitAmount').txt(formatNumber(0));
          line1.ele('CreditAmount').txt(formatNumber(transaction.amount));
          line1.ele('SystemEntryTime').txt(formatDateTime(new Date(transaction.createdAt)));
          
          // Line 2: Output VAT
          const vatAmount = (transaction.amount * transaction.vatPercent) / 100;
          if (vatAmount > 0) {
            const line2 = lines.ele('Line');
            line2.ele('RecordID').txt(`${transaction.id}-2`);
            line2.ele('AccountID').txt('5500');
            line2.ele('Description').txt(`Moms ${transaction.vatPercent}% - ${transaction.description}`);
            line2.ele('DebitAmount').txt(formatNumber(0));
            line2.ele('CreditAmount').txt(formatNumber(vatAmount));
            line2.ele('SystemEntryTime').txt(formatDateTime(new Date(transaction.createdAt)));
          }
        });
      }

      // Purchase journal
      if (purchaseEntries.length > 0) {
        const purchaseJournal = generalLedgerEntries.ele('Journal');
        purchaseJournal.ele('JournalID').txt('PURCHASES');
        purchaseJournal.ele('Description').txt('Purchase journal');
        purchaseJournal.ele('Type').txt('PL');

        purchaseEntries.forEach((transaction) => {
          const entry = purchaseJournal.ele('Transaction');
          entry.ele('TransactionID').txt(transaction.id);
          entry.ele('TransactionDate').txt(formatDate(new Date(transaction.date)));
          entry.ele('SourceDocumentID').txt(`SD-${transaction.id}`);
          
          const lines = entry.ele('Lines');
          
          // Line 1: Expense
          const line1 = lines.ele('Line');
          line1.ele('RecordID').txt(`${transaction.id}-1`);
          line1.ele('AccountID').txt('7000');
          line1.ele('Description').txt(transaction.description);
          line1.ele('DebitAmount').txt(formatNumber(transaction.amount));
          line1.ele('CreditAmount').txt(formatNumber(0));
          line1.ele('SystemEntryTime').txt(formatDateTime(new Date(transaction.createdAt)));
          
          // Line 2: Input VAT
          const vatAmount = (transaction.amount * transaction.vatPercent) / 100;
          if (vatAmount > 0) {
            const line2 = lines.ele('Line');
            line2.ele('RecordID').txt(`${transaction.id}-2`);
            line2.ele('AccountID').txt('5600');
            line2.ele('Description').txt(`Indgående moms ${transaction.vatPercent}% - ${transaction.description}`);
            line2.ele('DebitAmount').txt(formatNumber(vatAmount));
            line2.ele('CreditAmount').txt(formatNumber(0));
            line2.ele('SystemEntryTime').txt(formatDateTime(new Date(transaction.createdAt)));
          }
        });
      }
    }

    // 4. SourceDocuments - OPTIONAL but recommended
    if (salesEntries.length > 0) {
      const sourceDocuments = root.ele('SourceDocuments');
      const salesInvoices = sourceDocuments.ele('SalesInvoices');

      salesEntries.forEach((transaction, index) => {
        const invoice = salesInvoices.ele('Invoice');
        invoice.ele('InvoiceNo').txt(`INV-${(index + 1).toString().padStart(6, '0')}`);
        invoice.ele('InvoiceDate').txt(formatDate(new Date(transaction.date)));
        invoice.ele('CustomerID').txt('CUST-001');
        invoice.ele('InvoiceType').txt('Invoice');
        
        const invLines = invoice.ele('Lines');
        const invLine = invLines.ele('Line');
        invLine.ele('LineNumber').txt('1');
        invLine.ele('Description').txt(transaction.description);
        invLine.ele('Quantity').txt('1');
        invLine.ele('UnitPrice').txt(formatNumber(transaction.amount));
        invLine.ele('TaxBaseAmount').txt(formatNumber(transaction.amount));
        
        const vatInfo = mapVatCode(transaction.vatPercent);
        const invTax = invLine.ele('Tax');
        invTax.ele('TaxCode').txt(vatInfo.code);
        invTax.ele('TaxPercentage').txt(transaction.vatPercent.toString());
        invTax.ele('TaxAmount').txt(formatNumber((transaction.amount * transaction.vatPercent) / 100));
        
        const settlement = invoice.ele('Settlement');
        settlement.ele('SettlementAmount').txt(formatNumber(transaction.amount + (transaction.amount * transaction.vatPercent) / 100));
      });
    }

    // 5. Totals - RECOMMENDED for Danish compliance
    const totalsElement = root.ele('Totals');
    totalsElement.ele('NumberOfEntries').txt(transactions.length.toString());
    totalsElement.ele('TotalDebit').txt(formatNumber(totalPurchaseAmount + totalVAT));
    totalsElement.ele('TotalCredit').txt(formatNumber(totalSalesAmount + totalVAT));
    
    const vatTotals = totalsElement.ele('VATTotals');
    Object.entries(vatBreakdown).forEach(([rate, data]) => {
      const vatTotal = vatTotals.ele('VATTotal');
      vatTotal.ele('VATRate').txt(rate);
      vatTotal.ele('TaxableAmount').txt(formatNumber(data.amount));
      vatTotal.ele('VATAmount').txt(formatNumber(data.vat));
    });
    
    totalsElement.ele('TotalVATAmount').txt(formatNumber(totalVAT));
    totalsElement.ele('GrandTotal').txt(formatNumber(totalIncludingVAT));

    // Convert to XML string
    const xmlString = doc.end({ prettyPrint: true });

    // ========================================
    // STEP 3: Validate Generated XML
    // ========================================
    console.log('[SAF-T Export] Validating generated XML against Danish schema...');
    
    const schemaValidation = validateSAFT(xmlString);
    logValidationResults(schemaValidation, 'SAF-T Schema Validation');

    // Combine all validation issues
    const allErrors = [
      ...dataValidation.errors.map(e => ({ field: 'data', message: e, severity: 'error' as const })),
      ...schemaValidation.errors.map(e => ({ field: e.path, message: e.message, severity: 'error' as const })),
    ];

    const allWarnings = [
      ...dataValidation.warnings.map(w => ({ field: 'data', message: w, severity: 'warning' as const })),
      ...schemaValidation.warnings.map(w => ({ field: w.path, message: w.message, severity: 'warning' as const })),
    ];

    // Create response headers with validation info
    const responseHeaders: Record<string, string> = {
      'Content-Type': 'application/xml; charset=utf-8',
      'Content-Disposition': `attachment; filename="SAF-T-${month || 'export'}-${Date.now()}.xml"`,
      'X-Validation-Valid': schemaValidation.isValid ? 'true' : 'false',
      'X-Validation-Errors': allErrors.length.toString(),
      'X-Validation-Warnings': allWarnings.length.toString(),
      'X-Validation-Checks': schemaValidation.summary.totalChecks.toString(),
      'X-Validation-Passed': schemaValidation.summary.passed.toString(),
    };

    // Log summary
    console.log(`[SAF-T Export] Export complete. Entries: ${transactions.length} (output VAT: ${formatNumber(outputVAT)}, input VAT: ${formatNumber(inputVAT)}, net: ${formatNumber(outputVAT - inputVAT)}). Valid: ${schemaValidation.isValid}, Errors: ${allErrors.length}, Warnings: ${allWarnings.length}`);

    // Return XML even with warnings, but log errors
    return new NextResponse(xmlString, {
      status: 200,
      headers: responseHeaders,
    });

  } catch (error) {
    console.error('[SAF-T Export] Critical error:', error);
    return NextResponse.json(
      { error: 'Failed to generate SAF-T file', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
