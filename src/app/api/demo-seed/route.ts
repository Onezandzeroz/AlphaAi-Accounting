import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/session';
import { seedChartOfAccounts } from '@/lib/seed-chart-of-accounts';
import { JournalEntryStatus, VATCode } from '@prisma/client';

// ─── Demo Data Constants ──────────────────────────────────────────

const DEMO_COMPANY = {
  companyName: 'AlphaAi Consulting ApS',
  address: 'Nørrebrogade 42, 2200 København N',
  phone: '+45 12 34 56 78',
  email: 'info@alphaai-consulting.dk',
  cvrNumber: '12345678',
  invoicePrefix: 'AC',
  bankName: 'Nordea',
  bankAccount: '1234 5678901',
  bankRegistration: '1234',
  bankIban: 'DK50 1234 5678 9012 34',
  bankStreet: 'Holmens Kanal 2',
  bankCity: 'København',
  bankCountry: 'Danmark',
  invoiceTerms: 'Netto 30 dage. Betaling via bankoverførsel.',
};

const DEMO_CONTACTS = [
  {
    name: 'Københavns Erhvervsservice A/S',
    cvrNumber: '98765432',
    email: 'kontakt@kbh-erhverv.dk',
    phone: '+45 33 55 66 77',
    address: 'Bredgade 25, 1260 København K',
    city: 'København',
    postalCode: '1260',
    country: 'Danmark',
    type: 'CUSTOMER' as const,
  },
  {
    name: 'Jørgensen & Partners K/S',
    cvrNumber: '87654321',
    email: 'info@jorgensen-partners.dk',
    phone: '+45 44 88 99 00',
    address: 'Østerbrogade 78, 2100 København Ø',
    city: 'København',
    postalCode: '2100',
    country: 'Danmark',
    type: 'CUSTOMER' as const,
  },
  {
    name: 'Nordisk IT Solutions ApS',
    cvrNumber: '76543210',
    email: 'salg@nordisk-it.dk',
    phone: '+45 55 66 77 88',
    address: 'Technologiparken 12, 2605 Brøndby',
    city: 'Brøndby',
    postalCode: '2605',
    country: 'Danmark',
    type: 'SUPPLIER' as const,
  },
  {
    name: 'GRØN Energi A/S',
    cvrNumber: '65432109',
    email: 'kundeservice@groen-energi.dk',
    phone: '+45 70 20 30 40',
    address: 'Vindmøllevej 5, 2730 Herlev',
    city: 'Herlev',
    postalCode: '2730',
    country: 'Danmark',
    type: 'SUPPLIER' as const,
  },
];

const DEMO_TRANSACTIONS = [
  // ─── Sales (Jan–Apr 2026) ───
  { date: '2026-01-05', type: 'SALE' as const, amount: 25000, description: 'Konsulentydelse - Københavns Erhvervsservice', vatPercent: 25 },
  { date: '2026-01-15', type: 'SALE' as const, amount: 18750, description: 'Strategisk rådgivning - Jørgensen & Partners', vatPercent: 25 },
  { date: '2026-01-20', type: 'SALE' as const, amount: 8000, description: 'Workshop facilitation - Københavns Erhvervsservice', vatPercent: 25 },
  { date: '2026-02-03', type: 'SALE' as const, amount: 40000, description: 'IT-konsulentydelse - Københavns Erhvervsservice', vatPercent: 25 },
  { date: '2026-02-12', type: 'SALE' as const, amount: 15000, description: 'Forretningsudvikling - Jørgensen & Partners', vatPercent: 25 },
  { date: '2026-03-01', type: 'SALE' as const, amount: 45000, description: 'Digitaliseringsprojekt - Københavns Erhvervsservice', vatPercent: 25 },
  { date: '2026-03-18', type: 'SALE' as const, amount: 22500, description: 'Processoptimering - Jørgensen & Partners', vatPercent: 25 },
  { date: '2026-03-25', type: 'SALE' as const, amount: 12000, description: 'Årsrapport assistance - Jørgensen & Partners', vatPercent: 25 },
  { date: '2026-04-02', type: 'SALE' as const, amount: 28750, description: 'Dataanalyse - Københavns Erhvervsservice', vatPercent: 25 },
  { date: '2026-04-15', type: 'SALE' as const, amount: 16250, description: 'Risikoanalyse - Jørgensen & Partners', vatPercent: 25 },
  // ─── Purchases (Jan–Apr 2026) ───
  { date: '2026-01-03', type: 'PURCHASE' as const, amount: 15000, description: 'IT-udstyr - Nordisk IT Solutions', vatPercent: 25 },
  { date: '2026-01-10', type: 'PURCHASE' as const, amount: 2500, description: 'Kontorartikler - Office World', vatPercent: 25 },
  { date: '2026-01-25', type: 'PURCHASE' as const, amount: 1200, description: 'Kontorartikler refill - Office World', vatPercent: 25 },
  { date: '2026-02-01', type: 'PURCHASE' as const, amount: 15000, description: 'Husleje februar - KBH Ejendomme', vatPercent: 25 },
  { date: '2026-02-14', type: 'PURCHASE' as const, amount: 1800, description: 'Internet og telefon - Telia Danmark', vatPercent: 25 },
  { date: '2026-02-20', type: 'PURCHASE' as const, amount: 4200, description: 'El og varme - GRØN Energi', vatPercent: 25 },
  { date: '2026-03-01', type: 'PURCHASE' as const, amount: 15000, description: 'Husleje marts - KBH Ejendomme', vatPercent: 25 },
  { date: '2026-03-05', type: 'PURCHASE' as const, amount: 500, description: 'Regnskabsprogram licens - e-conomic', vatPercent: 25 },
  { date: '2026-03-15', type: 'PURCHASE' as const, amount: 2800, description: 'Rejseomkostninger - DSB Business', vatPercent: 25 },
  { date: '2026-04-01', type: 'PURCHASE' as const, amount: 15000, description: 'Husleje april - KBH Ejendomme', vatPercent: 25 },
];

// Helper: compute net amount (excl. VAT) and VAT from a gross amount
function vatSplit(gross: number, rate: number) {
  const net = Math.round((gross / (1 + rate / 100)) * 100) / 100;
  const vat = Math.round((gross - net) * 100) / 100;
  return { net, vat };
}

// ─── Journal Entry Templates ──────────────────────────────────────
// Each entry must be balanced: total debit === total credit
// Accounts: 1100=Bank, 1200=Receivables, 1800=IT Equipment, 4100=Service Revenue,
//           4510=Output VAT, 5410=Input VAT, 8000=Rent, 8100=Utilities,
//           8300=Travel, 8400=Insurance, 8500=Accounting Fees, 8600=Telecom, 8700=Office Supplies

interface JELine {
  accountNumber: string;
  debit: number;
  credit: number;
  description: string;
  vatCode?: VATCode;
}

interface JETemplate {
  date: string;
  description: string;
  reference: string;
  lines: JELine[];
}

const DEMO_JOURNAL_ENTRIES: JETemplate[] = [
  // 1. Jan 3 – IT equipment purchase (gross 15,000)
  {
    date: '2026-01-03',
    description: 'Køb af IT-udstyr – Nordisk IT Solutions',
    reference: 'DEMO-2026-001',
    lines: [
      { accountNumber: '1800', debit: 12000, credit: 0, description: 'IT-udstyr (netto)' },
      { accountNumber: '5410', debit: 3000, credit: 0, description: 'Indgående moms 25%', vatCode: 'K25' },
      { accountNumber: '1100', debit: 0, credit: 15000, description: 'Betaling via bank' },
    ],
  },
  // 2. Jan 5 – Consulting sale (gross 25,000)
  {
    date: '2026-01-05',
    description: 'Salg af konsulentydelse – Københavns Erhvervsservice',
    reference: 'DEMO-2026-002',
    lines: [
      { accountNumber: '1200', debit: 25000, credit: 0, description: 'Tilgodehavende kunde' },
      { accountNumber: '4100', debit: 0, credit: 20000, description: 'Salg af tjenesteydelser (netto)' },
      { accountNumber: '4510', debit: 0, credit: 5000, description: 'Udgående moms 25%', vatCode: 'S25' },
    ],
  },
  // 3. Jan 10 – Office supplies (gross 2,500)
  {
    date: '2026-01-10',
    description: 'Køb af kontorartikler – Office World',
    reference: 'DEMO-2026-003',
    lines: [
      { accountNumber: '8700', debit: 2000, credit: 0, description: 'Kontorartikler (netto)' },
      { accountNumber: '5410', debit: 500, credit: 0, description: 'Indgående moms 25%', vatCode: 'K25' },
      { accountNumber: '1100', debit: 0, credit: 2500, description: 'Betaling via bank' },
    ],
  },
  // 4. Jan 15 – Strategic advisory sale (gross 18,750)
  {
    date: '2026-01-15',
    description: 'Strategisk rådgivning – Jørgensen & Partners',
    reference: 'DEMO-2026-004',
    lines: [
      { accountNumber: '1200', debit: 18750, credit: 0, description: 'Tilgodehavende kunde' },
      { accountNumber: '4100', debit: 0, credit: 15000, description: 'Salg af tjenesteydelser (netto)' },
      { accountNumber: '4510', debit: 0, credit: 3750, description: 'Udgående moms 25%', vatCode: 'S25' },
    ],
  },
  // 5. Jan 20 – Workshop facilitation (gross 8,000)
  {
    date: '2026-01-20',
    description: 'Workshop facilitation – Københavns Erhvervsservice',
    reference: 'DEMO-2026-005',
    lines: [
      { accountNumber: '1200', debit: 8000, credit: 0, description: 'Tilgodehavende kunde' },
      { accountNumber: '4100', debit: 0, credit: 6400, description: 'Salg af tjenesteydelser (netto)' },
      { accountNumber: '4510', debit: 0, credit: 1600, description: 'Udgående moms 25%', vatCode: 'S25' },
    ],
  },
  // 6. Feb 1 – Rent February (gross 15,000)
  {
    date: '2026-02-01',
    description: 'Husleje februar – KBH Ejendomme',
    reference: 'DEMO-2026-006',
    lines: [
      { accountNumber: '8000', debit: 12000, credit: 0, description: 'Husleje (netto)' },
      { accountNumber: '5410', debit: 3000, credit: 0, description: 'Indgående moms 25%', vatCode: 'K25' },
      { accountNumber: '1100', debit: 0, credit: 15000, description: 'Betaling via bank' },
    ],
  },
  // 7. Feb 3 – IT consulting sale (gross 40,000)
  {
    date: '2026-02-03',
    description: 'IT-konsulentydelse – Københavns Erhvervsservice',
    reference: 'DEMO-2026-007',
    lines: [
      { accountNumber: '1200', debit: 40000, credit: 0, description: 'Tilgodehavende kunde' },
      { accountNumber: '4100', debit: 0, credit: 32000, description: 'Salg af tjenesteydelser (netto)' },
      { accountNumber: '4510', debit: 0, credit: 8000, description: 'Udgående moms 25%', vatCode: 'S25' },
    ],
  },
  // 8. Feb 14 – Telecom (gross 1,800)
  {
    date: '2026-02-14',
    description: 'Internet og telefon – Telia Danmark',
    reference: 'DEMO-2026-008',
    lines: [
      { accountNumber: '8600', debit: 1440, credit: 0, description: 'Telefon og internet (netto)' },
      { accountNumber: '5410', debit: 360, credit: 0, description: 'Indgående moms 25%', vatCode: 'K25' },
      { accountNumber: '1100', debit: 0, credit: 1800, description: 'Betaling via bank' },
    ],
  },
  // 9. Feb 20 – Utilities (gross 4,200)
  {
    date: '2026-02-20',
    description: 'El og varme – GRØN Energi A/S',
    reference: 'DEMO-2026-009',
    lines: [
      { accountNumber: '8100', debit: 3360, credit: 0, description: 'El, vand og varme (netto)' },
      { accountNumber: '5410', debit: 840, credit: 0, description: 'Indgående moms 25%', vatCode: 'K25' },
      { accountNumber: '1100', debit: 0, credit: 4200, description: 'Betaling via bank' },
    ],
  },
  // 10. Mar 1 – Rent March (gross 15,000)
  {
    date: '2026-03-01',
    description: 'Husleje marts – KBH Ejendomme',
    reference: 'DEMO-2026-010',
    lines: [
      { accountNumber: '8000', debit: 12000, credit: 0, description: 'Husleje (netto)' },
      { accountNumber: '5410', debit: 3000, credit: 0, description: 'Indgående moms 25%', vatCode: 'K25' },
      { accountNumber: '1100', debit: 0, credit: 15000, description: 'Betaling via bank' },
    ],
  },
  // 11. Mar 5 – Accounting software licence (gross 500)
  {
    date: '2026-03-05',
    description: 'Regnskabsprogram licens – e-conomic',
    reference: 'DEMO-2026-011',
    lines: [
      { accountNumber: '8500', debit: 400, credit: 0, description: 'Regnskabshonorar (netto)' },
      { accountNumber: '5410', debit: 100, credit: 0, description: 'Indgående moms 25%', vatCode: 'K25' },
      { accountNumber: '1100', debit: 0, credit: 500, description: 'Betaling via bank' },
    ],
  },
  // 12. Mar 15 – Travel expenses (gross 2,800)
  {
    date: '2026-03-15',
    description: 'Rejseomkostninger – DSB Business',
    reference: 'DEMO-2026-012',
    lines: [
      { accountNumber: '8300', debit: 2240, credit: 0, description: 'Rejseomkostninger (netto)' },
      { accountNumber: '5410', debit: 560, credit: 0, description: 'Indgående moms 25%', vatCode: 'K25' },
      { accountNumber: '1100', debit: 0, credit: 2800, description: 'Betaling via bank' },
    ],
  },
  // 13. Apr 1 – Rent April (gross 15,000)
  {
    date: '2026-04-01',
    description: 'Husleje april – KBH Ejendomme',
    reference: 'DEMO-2026-013',
    lines: [
      { accountNumber: '8000', debit: 12000, credit: 0, description: 'Husleje (netto)' },
      { accountNumber: '5410', debit: 3000, credit: 0, description: 'Indgående moms 25%', vatCode: 'K25' },
      { accountNumber: '1100', debit: 0, credit: 15000, description: 'Betaling via bank' },
    ],
  },
  // 14. Apr 8 – Quarterly insurance (gross 3,600)
  {
    date: '2026-04-08',
    description: 'Forsikring kvartal – Tryg Forsikring',
    reference: 'DEMO-2026-014',
    lines: [
      { accountNumber: '8400', debit: 2880, credit: 0, description: 'Forsikring (netto)' },
      { accountNumber: '5410', debit: 720, credit: 0, description: 'Indgående moms 25%', vatCode: 'K25' },
      { accountNumber: '1100', debit: 0, credit: 3600, description: 'Betaling via bank' },
    ],
  },
];

// ─── Demo Invoice Templates ───────────────────────────────────────

interface InvoiceTemplate {
  invoiceNumber: string;
  customerName: string;
  customerAddress: string;
  customerEmail: string;
  customerPhone: string;
  customerCvr: string;
  issueDate: string;
  dueDate: string;
  lineItems: { description: string; quantity: number; unitPrice: number; vatPercent: number }[];
  notes: string;
  contactIndex: number; // index into DEMO_CONTACTS
}

const DEMO_INVOICES: InvoiceTemplate[] = [
  {
    invoiceNumber: '#AC-2026-001',
    customerName: 'Københavns Erhvervsservice A/S',
    customerAddress: 'Bredgade 25, 1260 København K',
    customerEmail: 'kontakt@kbh-erhverv.dk',
    customerPhone: '+45 33 55 66 77',
    customerCvr: '98765432',
    issueDate: '2026-01-05',
    dueDate: '2026-02-04',
    lineItems: [
      { description: 'Konsulentydelse – Forretningsanalyse', quantity: 10, unitPrice: 2000, vatPercent: 25 },
    ],
    notes: 'Tak for samarbejdet.',
    contactIndex: 0,
  },
  {
    invoiceNumber: '#AC-2026-002',
    customerName: 'Jørgensen & Partners K/S',
    customerAddress: 'Østerbrogade 78, 2100 København Ø',
    customerEmail: 'info@jorgensen-partners.dk',
    customerPhone: '+45 44 88 99 00',
    customerCvr: '87654321',
    issueDate: '2026-01-15',
    dueDate: '2026-02-14',
    lineItems: [
      { description: 'Strategisk rådgivning', quantity: 15, unitPrice: 1000, vatPercent: 25 },
    ],
    notes: 'Faktura for rådgivningsopgave januar 2026.',
    contactIndex: 1,
  },
  {
    invoiceNumber: '#AC-2026-003',
    customerName: 'Københavns Erhvervsservice A/S',
    customerAddress: 'Bredgade 25, 1260 København K',
    customerEmail: 'kontakt@kbh-erhverv.dk',
    customerPhone: '+45 33 55 66 77',
    customerCvr: '98765432',
    issueDate: '2026-02-03',
    dueDate: '2026-03-05',
    lineItems: [
      { description: 'IT-konsulentydelse – Systemimplementering', quantity: 20, unitPrice: 1600, vatPercent: 25 },
    ],
    notes: 'Fase 1 af systemimplementering.',
    contactIndex: 0,
  },
  {
    invoiceNumber: '#AC-2026-004',
    customerName: 'Jørgensen & Partners K/S',
    customerAddress: 'Østerbrogade 78, 2100 København Ø',
    customerEmail: 'info@jorgensen-partners.dk',
    customerPhone: '+45 44 88 99 00',
    customerCvr: '87654321',
    issueDate: '2026-02-12',
    dueDate: '2026-03-14',
    lineItems: [
      { description: 'Forretningsudviklingsworkshop', quantity: 2, unitPrice: 7500, vatPercent: 25 },
    ],
    notes: 'Workshop forretningsudvikling februar 2026.',
    contactIndex: 1,
  },
  {
    invoiceNumber: '#AC-2026-005',
    customerName: 'Københavns Erhvervsservice A/S',
    customerAddress: 'Bredgade 25, 1260 København K',
    customerEmail: 'kontakt@kbh-erhverv.dk',
    customerPhone: '+45 33 55 66 77',
    customerCvr: '98765432',
    issueDate: '2026-03-01',
    dueDate: '2026-03-31',
    lineItems: [
      { description: 'Digitaliseringsprojekt – Fase 1', quantity: 30, unitPrice: 1500, vatPercent: 25 },
    ],
    notes: 'Faktura for digitaliseringsprojekt marts 2026.',
    contactIndex: 0,
  },
  {
    invoiceNumber: '#AC-2026-006',
    customerName: 'Jørgensen & Partners K/S',
    customerAddress: 'Østerbrogade 78, 2100 København Ø',
    customerEmail: 'info@jorgensen-partners.dk',
    customerPhone: '+45 44 88 99 00',
    customerCvr: '87654321',
    issueDate: '2026-03-18',
    dueDate: '2026-04-17',
    lineItems: [
      { description: 'Processoptimering', quantity: 15, unitPrice: 1500, vatPercent: 25 },
    ],
    notes: 'Processoptimeringsopgave for Jørgensen & Partners.',
    contactIndex: 1,
  },
];

// ─── Seeding Function (exported for reuse) ────────────────────────

export async function seedDemoData(userId: string): Promise<Record<string, number>> {
  // 1. Seed chart of accounts for demo (idempotent — skips if already exists)
  const accountsSeeded = await seedChartOfAccounts(userId, true);

  // 2. Create demo CompanyInfo (only if no existing demo company info)
  const existingCompanyInfo = await db.companyInfo.findFirst({ where: { userId, isDemo: true } });
  if (!existingCompanyInfo) {
    await db.companyInfo.create({
      data: {
        ...DEMO_COMPANY,
        isDemo: true,
        nextInvoiceSequence: 7, // after 6 demo invoices
        currentYear: 2026,
        userId,
      },
    });
  }
  const companyInfoCount = 1;

  // 3. Create contacts
  const contacts = await db.contact.createMany({
    data: DEMO_CONTACTS.map((c) => ({
      ...c,
      isDemo: true,
      isActive: true,
      userId,
    })),
  });

  // Fetch created contacts for invoice linking
  const createdContacts = await db.contact.findMany({
    where: { userId, isDemo: true },
    orderBy: { createdAt: 'asc' },
  });

  // 4. Create transactions
  const transactions = await db.transaction.createMany({
    data: DEMO_TRANSACTIONS.map((t) => ({
      date: new Date(t.date),
      type: t.type,
      amount: t.amount,
      currency: 'DKK',
      description: t.description,
      vatPercent: t.vatPercent,
      isDemo: true,
      cancelled: false,
      userId,
    })),
  });

  // 5. Create invoices
  let invoicesCount = 0;
  for (const inv of DEMO_INVOICES) {
    const subtotal = inv.lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const vatTotal = inv.lineItems.reduce((sum, item) => sum + (item.quantity * item.unitPrice * item.vatPercent) / 100, 0);
    const total = subtotal + vatTotal;
    const contact = createdContacts[inv.contactIndex];

    await db.invoice.create({
      data: {
        invoiceNumber: inv.invoiceNumber,
        customerName: inv.customerName,
        customerAddress: inv.customerAddress,
        customerEmail: inv.customerEmail,
        customerPhone: inv.customerPhone,
        customerCvr: inv.customerCvr,
        issueDate: new Date(inv.issueDate),
        dueDate: new Date(inv.dueDate),
        lineItems: JSON.stringify(inv.lineItems),
        subtotal,
        vatTotal,
        total,
        currency: 'DKK',
        status: 'SENT' as const,
        notes: inv.notes,
        isDemo: true,
        cancelled: false,
        contactId: contact?.id ?? null,
        userId,
      },
    });
    invoicesCount++;
  }

  // 6. Look up demo accounts for journal entries
  const accounts = await db.account.findMany({
    where: { userId, isDemo: true },
    select: { id: true, number: true },
  });
  const accountMap = new Map(accounts.map((a) => [a.number, a.id]));

  // 7. Create journal entries with lines
  let journalEntriesCount = 0;
  for (const je of DEMO_JOURNAL_ENTRIES) {
    const totalDebit = je.lines.reduce((s, l) => s + l.debit, 0);
    const totalCredit = je.lines.reduce((s, l) => s + l.credit, 0);

    // Safety check — should always pass with our static data
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      console.error(`[Demo Seed] Unbalanced journal entry ${je.reference}: debit=${totalDebit}, credit=${totalCredit}`);
      continue;
    }

    await db.journalEntry.create({
      data: {
        date: new Date(je.date),
        description: je.description,
        reference: je.reference,
        status: 'POSTED' as JournalEntryStatus,
        isDemo: true,
        cancelled: false,
        userId,
        lines: {
          create: je.lines.map((l) => {
            const accountId = accountMap.get(l.accountNumber);
            if (!accountId) {
              throw new Error(`Account ${l.accountNumber} not found for user ${userId}`);
            }
            return {
              accountId,
              debit: l.debit,
              credit: l.credit,
              description: l.description,
              vatCode: l.vatCode ?? null,
            };
          }),
        },
      },
    });
    journalEntriesCount++;
  }

  // 8. Create fiscal periods (Jan–Apr 2026)
  const fiscalPeriods = await db.fiscalPeriod.createMany({
    data: [1, 2, 3, 4].map((month) => ({
      year: 2026,
      month,
      status: 'OPEN' as const,
      isDemo: true,
      userId,
    })),
  });

  // 9. Enable demo mode for the user
  await db.user.update({
    where: { id: userId },
    data: { demoModeEnabled: true },
  });

  return {
    accountsSeeded,
    companyInfo: companyInfoCount,
    contacts: contacts.count,
    transactions: transactions.count,
    invoices: invoicesCount,
    journalEntries: journalEntriesCount,
    fiscalPeriods: fiscalPeriods.count,
  };
}

// ─── Route Handler ────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if demo data already exists
    const existingDemoTransactions = await db.transaction.count({
      where: { userId: user.id, isDemo: true },
    });

    if (existingDemoTransactions > 0) {
      // Return existing counts
      const [transactions, invoices, journalEntries, contacts, companyInfo, fiscalPeriods] = await Promise.all([
        db.transaction.count({ where: { userId: user.id, isDemo: true } }),
        db.invoice.count({ where: { userId: user.id, isDemo: true } }),
        db.journalEntry.count({ where: { userId: user.id, isDemo: true } }),
        db.contact.count({ where: { userId: user.id, isDemo: true } }),
        db.companyInfo.count({ where: { userId: user.id, isDemo: true } }),
        db.fiscalPeriod.count({ where: { userId: user.id, isDemo: true } }),
      ]);

      return NextResponse.json({
        message: 'Demo data already exists',
        alreadySeeded: true,
        transactions,
        invoices,
        journalEntries,
        contacts,
        companyInfo,
        fiscalPeriods,
      });
    }

    // Seed all demo data
    const counts = await seedDemoData(user.id);

    return NextResponse.json({
      message: 'Demo data seeded successfully',
      alreadySeeded: false,
      ...counts,
    });
  } catch (error) {
    console.error('[Demo Seed] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
