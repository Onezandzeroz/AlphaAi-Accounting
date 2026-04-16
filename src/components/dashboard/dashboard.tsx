'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { User } from '@/lib/auth-store';
import { useTranslation } from '@/lib/use-translation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import Image from 'next/image';
import { AddTransactionForm } from '@/components/transaction/add-transaction-form';
import {
  Plus,
  Receipt,
  Calculator,
  TrendingUp,
  FileText,
  Loader2,
  ArrowUpRight,
  Zap,
  Shield,
  ArrowDownRight,
  Scale,
  BookOpen,
  Landmark,
  AlertTriangle,
  PenLine,
  BarChart3,
  ChevronRight,
  ArrowRight,
  ArrowDownLeft,
  Sparkles,
  RefreshCw,
  CheckCircle2,
  Wand2,
  Building2,
  ListChecks,
  ReceiptText,
  FilePlus2,
  Eye,
  EyeOff,
} from 'lucide-react';
import { format, subMonths, startOfYear } from 'date-fns';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  AreaChart,
  Area,
  Legend,
} from 'recharts';

// ─── Types ────────────────────────────────────────────────────────

interface Transaction {
  id: string;
  date: string;
  type: 'SALE' | 'PURCHASE';
  amount: number;
  description: string;
  vatPercent: number;
  receiptImage: string | null;
  invoiceId?: string | null;
}

interface Invoice {
  id: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  lineItems: string;
  subtotal: number;
  vatTotal: number;
  total: number;
  status: string;
  customerName: string;
}

interface JournalEntry {
  id: string;
  date: string;
  description: string;
  reference: string | null;
  status: string;
  cancelled: boolean;
  lines: Array<{
    id: string;
    debit: number;
    credit: number;
    description: string | null;
    account: {
      number: string;
      name: string;
      type: string;
    };
  }>;
}

interface LedgerAccount {
  accountId: string;
  accountNumber: string;
  accountName: string;
  accountType: string;
  debitTotal: number;
  creditTotal: number;
  balance: number;
}

interface IncomeStatement {
  grossProfit: { revenue: number; costOfGoods: number; grossProfit: number };
  operatingExpenses: { personnel: number; otherOperating: number; total: number };
  operatingResult: number;
  financialItems: { financialIncome: number; financialExpenses: number; net: number };
  netResult: number;
}

interface BalanceSheet {
  assets: { totalAssets: number };
  liabilities: { totalLiabilities: number };
  equity: { totalEquity: number; currentYearResult: number };
}

interface DashboardProps {
  user: User;
  onNavigate?: (view: string) => void;
}

// ─── Constants ────────────────────────────────────────────────────

const COLORS = ['#554fe9', '#7c9a82', '#c9a87c', '#9490e8', '#c9928f', '#7dabb5'];
const PURCHASE_COLORS = ['#7c9a82', '#c9a87c', '#9490e8', '#c9928f', '#7dabb5', '#554fe9'];

const RECHARTS_TOOLTIP_STYLE_LIGHT = {
  backgroundColor: 'rgba(44, 42, 39, 0.92)',
  border: 'none',
  borderRadius: '10px',
  boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
  color: '#faf9f7',
  fontSize: '13px',
};

const RECHARTS_TOOLTIP_STYLE_DARK = {
  backgroundColor: 'rgba(36, 33, 32, 0.95)',
  border: '1px solid rgba(58, 53, 48, 0.8)',
  borderRadius: '10px',
  boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
  color: '#e8e4df',
  fontSize: '13px',
};

// ─── Component ────────────────────────────────────────────────────

export function Dashboard({ user, onNavigate }: DashboardProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const { t, tc, td, tm, language } = useTranslation();

  // Double-entry state
  const [hasDoubleEntryData, setHasDoubleEntryData] = useState(false);
  const [incomeStatement, setIncomeStatement] = useState<IncomeStatement | null>(null);
  const [balanceSheet, setBalanceSheet] = useState<BalanceSheet | null>(null);
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [allPostedJournalEntries, setAllPostedJournalEntries] = useState<JournalEntry[]>([]);
  const [ledgerAccounts, setLedgerAccounts] = useState<LedgerAccount[]>([]);
  const [vatRegister, setVatRegister] = useState<any>(null);

  // Onboarding state
  const [isSeeding, setIsSeeding] = useState(false);
  const [hasCompanyInfo, setHasCompanyInfo] = useState(false);
  const [hasAccounts, setHasAccounts] = useState(false);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [demoModeEnabled, setDemoModeEnabled] = useState(false);

  // ─── Date helpers ───────────────────────────────────────────────

  const today = useMemo(() => format(new Date(), 'yyyy-MM-dd'), []);
  const yearStart = useMemo(() => format(startOfYear(new Date()), 'yyyy-MM-dd'), []);
  const sixMonthsAgo = useMemo(() => format(subMonths(new Date(), 5), 'yyyy-MM-01'), []);

  // ─── Fetch legacy data ──────────────────────────────────────────

  const fetchLegacyData = useCallback(async () => {
    try {
      const [txResponse, invResponse] = await Promise.all([
        fetch('/api/transactions'),
        fetch('/api/invoices'),
      ]);

      if (!txResponse.ok) console.error('Transactions API error:', txResponse.status);
      if (!invResponse.ok) console.error('Invoices API error:', invResponse.status);

      const txData = txResponse.ok ? await txResponse.json() : {};
      const invData = invResponse.ok ? await invResponse.json() : {};

      const allTransactions: Transaction[] = txData.transactions || [];
      const invoices: Invoice[] = invData.invoices || [];

      const invoiceIdsWithTransactions = new Set(
        allTransactions
          .filter((tx) => tx.invoiceId)
          .map((tx) => tx.invoiceId)
      );

      const virtualTransactions: Transaction[] = [];

      for (const invoice of invoices) {
        if (invoice.status === 'CANCELLED' || invoice.status === 'DRAFT') continue;
        if (invoiceIdsWithTransactions.has(invoice.id)) continue;

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
            virtualTransactions.push({
              id: `inv-${invoice.id}-${item.description.slice(0, 20)}`,
              date: invoice.issueDate,
              type: 'SALE',
              amount: lineTotal,
              description: `${invoice.invoiceNumber} - ${item.description}`,
              vatPercent: item.vatPercent,
              receiptImage: null,
              invoiceId: invoice.id,
            });
          }
        } catch {
          console.warn(`Could not parse lineItems for invoice ${invoice.id}`);
        }
      }

      setTransactions([...allTransactions, ...virtualTransactions]);
      setInvoices(invoices);
    } catch (error) {
      console.error('Failed to fetch legacy data:', error);
    }
  }, []);

  // ─── Fetch double-entry data ────────────────────────────────────

  const fetchDoubleEntryData = useCallback(async () => {
    try {
      const [isRes, bsRes, jeRes, ledgerRes, vatRes] = await Promise.all([
        fetch(`/api/reports?type=income-statement&from=${yearStart}&to=${today}`),
        fetch(`/api/reports?type=balance-sheet&to=${today}`),
        fetch('/api/journal-entries?status=POSTED'),
        fetch(`/api/ledger?from=${yearStart}&to=${today}`),
        fetch(`/api/vat-register?from=${yearStart}&to=${today}`),
      ]);

      const [isData, bsData, jeData, ledgerData, vatData] = await Promise.all([
        isRes.ok ? isRes.json() : null,
        bsRes.ok ? bsRes.json() : null,
        jeRes.ok ? jeRes.json() : null,
        ledgerRes.ok ? ledgerRes.json() : null,
        vatRes.ok ? vatRes.json() : null,
      ]);

      // Check if there is any posted data
      const postedEntries: JournalEntry[] = (jeData?.journalEntries || []).filter(
        (e: JournalEntry) => !e.cancelled
      );
      const hasData = postedEntries.length > 0;

      setHasDoubleEntryData(hasData);

      if (hasData) {
        setIncomeStatement(isData);
        setBalanceSheet(bsData);
        // Keep first 5 for recent display, but store all for chart aggregation
        setJournalEntries(postedEntries.slice(0, 5));
        setAllPostedJournalEntries(postedEntries);
        setLedgerAccounts(ledgerData?.accounts || []);
        setVatRegister(vatData);
      }
    } catch (error) {
      console.error('Failed to fetch double-entry data:', error);
    }
  }, [yearStart, today]);

  // ─── Fetch onboarding data ──────────────────────────────────────

  const fetchOnboardingData = useCallback(async () => {
    try {
      const [companyRes, accountsRes, demoModeRes] = await Promise.all([
        fetch('/api/company'),
        fetch('/api/accounts'),
        fetch('/api/demo-mode'),
      ]);

      if (companyRes.ok) {
        const companyData = await companyRes.json();
        setHasCompanyInfo(!!companyData.companyInfo);
      }

      if (accountsRes.ok) {
        const accountsData = await accountsRes.json();
        setHasAccounts(Array.isArray(accountsData) ? accountsData.length > 0 : Array.isArray(accountsData.accounts) ? accountsData.accounts.length > 0 : false);
      }

      if (demoModeRes.ok) {
        const demoData = await demoModeRes.json();
        setDemoModeEnabled(demoData.demoModeEnabled === true);
      }
    } catch (error) {
      console.error('Failed to fetch onboarding data:', error);
    }
  }, []);

  // ─── Master fetch ───────────────────────────────────────────────

  const fetchAllData = useCallback(async () => {
    setIsLoading(true);
    await Promise.all([fetchLegacyData(), fetchDoubleEntryData(), fetchOnboardingData()]);
    setIsLoading(false);
  }, [fetchLegacyData, fetchDoubleEntryData, fetchOnboardingData]);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  const handleAddTransaction = useCallback(() => {
    setIsDialogOpen(false);
    fetchAllData();
  }, [fetchAllData]);

  const handleLoadDemoData = async () => {
    setIsSeeding(true);
    try {
      const res = await fetch('/api/demo-seed', { method: 'POST' });
      if (res.ok) {
        setDemoModeEnabled(true);
        fetchAllData();
      }
    } catch (error) {
      console.error('Failed to load demo data:', error);
    } finally {
      setIsSeeding(false);
    }
  };

  const handleToggleDemoMode = async () => {
    try {
      const action = demoModeEnabled ? 'exit' : 'enter';
      const res = await fetch('/api/demo-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        setDemoModeEnabled(!demoModeEnabled);
        fetchAllData();
      }
    } catch (error) {
      console.error('Failed to toggle demo mode:', error);
    }
  };

  // ─── Onboarding / empty state ──────────────────────────────────

  const isEmptyState = !isLoading && transactions.length === 0 && !hasDoubleEntryData;

  const onboardingSteps = useMemo(() => [
    {
      step: 1,
      key: 'company',
      title: language === 'da' ? 'Virksomhedsoplysninger' : 'Company Info',
      description: language === 'da' ? 'Tilf\u00f8j virksomhedsnavn, adresse, CVR og bankoplysninger' : 'Add business name, address, CVR and bank details',
      icon: Building2,
      done: hasCompanyInfo,
      action: () => onNavigate?.('settings'),
      gradient: 'from-[#6a66f0] to-[#9b96f5]',
      iconBg: 'bg-[#eeeefa] dark:bg-[#28273e]',
      iconColor: 'text-[#6a66f0] dark:text-[#9b96f5]',
    },
    {
      step: 2,
      key: 'accounts',
      title: language === 'da' ? 'Opret kontoplan' : 'Chart of Accounts',
      description: language === 'da' ? 'Opret standard danske konti' : 'Create standard Danish accounts',
      icon: ListChecks,
      done: hasAccounts,
      action: () => onNavigate?.('accounts'),
      gradient: 'from-[#10b981] to-[#34d399]',
      iconBg: 'bg-[#edf5ef] dark:bg-[#242e26]',
      iconColor: 'text-[#10b981] dark:text-[#34d399]',
    },
    {
      step: 3,
      key: 'transaction',
      title: language === 'da' ? 'Registr\u00e9r f\u00f8rste postering' : 'Record First Transaction',
      description: language === 'da' ? 'Registr\u00e9r salg eller k\u00f8b med moms' : 'Record a sale or purchase with VAT',
      icon: ReceiptText,
      done: transactions.length > 0,
      action: () => setIsDialogOpen(true),
      gradient: 'from-[#f59e0b] to-[#fbbf24]',
      iconBg: 'bg-[#faf5ee] dark:bg-[#302a22]',
      iconColor: 'text-[#f59e0b] dark:text-[#fbbf24]',
    },
    {
      step: 4,
      key: 'invoice',
      title: language === 'da' ? 'Opret f\u00f8rste faktura' : 'Create First Invoice',
      description: language === 'da' ? 'Opret en professionel faktura' : 'Create a professional invoice',
      icon: FilePlus2,
      done: invoices.length > 0,
      action: () => onNavigate?.('invoices'),
      gradient: 'from-[#ef4444] to-[#f87171]',
      iconBg: 'bg-[#f7eeed] dark:bg-[#2e2524]',
      iconColor: 'text-[#ef4444] dark:text-[#f87171]',
    },
  ], [hasCompanyInfo, hasAccounts, transactions.length, invoices.length, onNavigate, language]);

  const completedSteps = onboardingSteps.filter(s => s.done).length;

  // ─── Legacy stats computation ───────────────────────────────────

  const currentMonth = format(new Date(), 'yyyy-MM');
  const thisMonthTransactions = transactions.filter((t) => {
    const dateStr = t.date?.substring(0, 7) || '';
    return dateStr.startsWith(currentMonth);
  });

  const { salesThisMonth, purchasesThisMonth } = useMemo(() => {
    const sales = thisMonthTransactions.filter((t) => t.type === 'SALE' || !t.type);
    const purchases = thisMonthTransactions.filter((t) => t.type === 'PURCHASE');
    return { salesThisMonth: sales, purchasesThisMonth: purchases };
  }, [thisMonthTransactions]);

  const { salesAll, purchasesAll } = useMemo(() => {
    const sales = transactions.filter((t) => t.type === 'SALE' || !t.type);
    const purchases = transactions.filter((t) => t.type === 'PURCHASE');
    return { salesAll: sales, purchasesAll: purchases };
  }, [transactions]);

  const stats = useMemo(() => {
    const outputVATThisMonth = salesThisMonth.reduce(
      (sum, t) => sum + (t.amount * t.vatPercent) / 100,
      0
    );
    const inputVATThisMonth = purchasesThisMonth.reduce(
      (sum, t) => sum + (t.amount * t.vatPercent) / 100,
      0
    );
    const netVATThisMonth = outputVATThisMonth - inputVATThisMonth;

    const salesAmountThisMonth = salesThisMonth.reduce((sum, t) => sum + t.amount, 0);
    const purchasesAmountThisMonth = purchasesThisMonth.reduce((sum, t) => sum + t.amount, 0);

    const outputVATAll = salesAll.reduce(
      (sum, t) => sum + (t.amount * t.vatPercent) / 100,
      0
    );
    const inputVATAll = purchasesAll.reduce(
      (sum, t) => sum + (t.amount * t.vatPercent) / 100,
      0
    );
    const netVATAll = outputVATAll - inputVATAll;
    const totalRevenueAll = salesAll.reduce((sum, t) => sum + t.amount, 0);

    return {
      thisMonth: {
        outputVAT: outputVATThisMonth,
        inputVAT: inputVATThisMonth,
        netVAT: netVATThisMonth,
        salesAmount: salesAmountThisMonth,
        purchasesAmount: purchasesAmountThisMonth,
        totalAmount: salesAmountThisMonth + purchasesAmountThisMonth,
        count: thisMonthTransactions.length,
        salesCount: salesThisMonth.length,
        purchasesCount: purchasesThisMonth.length,
      },
      all: {
        outputVAT: outputVATAll,
        inputVAT: inputVATAll,
        netVAT: netVATAll,
        totalRevenue: totalRevenueAll,
        count: transactions.length,
      },
    };
  }, [transactions, thisMonthTransactions, salesThisMonth, purchasesThisMonth, salesAll, purchasesAll]);

  const vatBreakdown = useMemo(() => {
    const breakdown: Record<number, { amount: number; vat: number; count: number }> = {};

    salesThisMonth.forEach((t) => {
      if (!breakdown[t.vatPercent]) {
        breakdown[t.vatPercent] = { amount: 0, vat: 0, count: 0 };
      }
      breakdown[t.vatPercent].amount += t.amount;
      breakdown[t.vatPercent].vat += (t.amount * t.vatPercent) / 100;
      breakdown[t.vatPercent].count += 1;
    });

    return Object.entries(breakdown).map(([rate, data]) => ({
      name: `${rate}%`,
      rate: parseFloat(rate),
      amount: data.amount,
      vat: data.vat,
      count: data.count,
    }));
  }, [salesThisMonth]);

  const monthlyTrend = useMemo(() => {
    const months: Record<string, { month: string; outputVat: number; inputVat: number; netVat: number; amount: number }> = {};

    transactions.forEach((t) => {
      const month = t.date.substring(0, 7);
      if (!months[month]) {
        months[month] = { month, outputVat: 0, inputVat: 0, netVat: 0, amount: 0 };
      }
      const vat = (t.amount * t.vatPercent) / 100;
      months[month].amount += t.amount;
      if (t.type === 'PURCHASE') {
        months[month].inputVat += vat;
      } else {
        months[month].outputVat += vat;
      }
    });

    return Object.values(months)
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-6)
      .map((m) => ({
        ...m,
        netVat: m.outputVat - m.inputVat,
        label: format(new Date(m.month + '-01'), 'MMM'),
      }));
  }, [transactions]);

  // ─── Double-entry derived data ──────────────────────────────────

  const outputVAT = useMemo(() => {
    // Use VAT register data if available (real VAT from journal entry lines)
    if (vatRegister?.totalOutputVAT !== undefined) {
      return Math.round(vatRegister.totalOutputVAT * 100) / 100;
    }
    // Fallback: estimate output VAT as 25% of revenue
    if (!incomeStatement) return 0;
    return Math.round(incomeStatement.grossProfit.revenue * 0.25 * 100) / 100;
  }, [vatRegister, incomeStatement]);

  const inputVAT = useMemo(() => {
    // Use VAT register data if available
    if (vatRegister?.totalInputVAT !== undefined) {
      return Math.round(vatRegister.totalInputVAT * 100) / 100;
    }
    // Fallback: estimate input VAT as 25% of expenses
    if (!incomeStatement) return 0;
    const totalExpenses = incomeStatement.operatingExpenses.total + incomeStatement.financialItems.financialExpenses;
    return Math.round(totalExpenses * 0.25 * 100) / 100;
  }, [vatRegister, incomeStatement]);

  const netVAT = useMemo(() => {
    return Math.round((outputVAT - inputVAT) * 100) / 100;
  }, [outputVAT, inputVAT]);

  // Monthly revenue/expense chart from ledger data
  const monthlyRevenueChart = useMemo(() => {
    if (!hasDoubleEntryData) return [];
    const now = new Date();
    const months: Record<string, { month: string; revenue: number; expenses: number; net: number }> = {};

    // Initialize last 6 months
    for (let i = 5; i >= 0; i--) {
      const d = subMonths(now, i);
      const key = format(d, 'yyyy-MM');
      months[key] = { month: key, revenue: 0, expenses: 0, net: 0 };
    }

    // Aggregate from ALL journal entries (not just the 5 recent ones)
    allPostedJournalEntries.forEach((entry) => {
      const month = entry.date.substring(0, 7);
      if (!months[month]) return;

      entry.lines.forEach((line) => {
        const amt = line.debit - line.credit;
        if (line.account.type === 'REVENUE') {
          // Revenue normal balance is credit, so credit is positive revenue
          months[month].revenue += line.credit - line.debit;
        } else if (line.account.type === 'EXPENSE') {
          // Expense normal balance is debit
          months[month].expenses += line.debit - line.credit;
        }
      });
    });

    return Object.values(months).map((m) => ({
      ...m,
      revenue: Math.round(m.revenue * 100) / 100,
      expenses: Math.round(m.expenses * 100) / 100,
      net: Math.round((m.revenue - m.expenses) * 100) / 100,
      label: format(new Date(m.month + '-01'), 'MMM'),
    }));
  }, [hasDoubleEntryData, journalEntries]);

  // Top 5 accounts by activity
  const topAccounts = useMemo(() => {
    if (!ledgerAccounts || ledgerAccounts.length === 0) return [];
    return [...ledgerAccounts]
      .filter((a) => a.debitTotal !== 0 || a.creditTotal !== 0)
      .sort((a, b) => (Math.abs(b.debitTotal) + Math.abs(b.creditTotal)) - (Math.abs(a.debitTotal) + Math.abs(a.creditTotal)))
      .slice(0, 5);
  }, [ledgerAccounts]);

  const handleExportPeppol = useCallback(async (transactionId: string) => {
    try {
      setExportingId(transactionId);
      const response = await fetch(`/api/transactions/export-peppol?id=${transactionId}`);

      if (!response.ok) throw new Error('Failed to export');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `oioubl-${transactionId.substring(0, 8)}.xml`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setExportingId(null);
    }
  }, []);

  // ─── Account type badge helper ──────────────────────────────────

  const getAccountTypeBadge = (type: string) => {
    const map: Record<string, { label: string; className: string }> = {
      ASSET: {
        label: language === 'da' ? 'Aktiv' : 'Asset',
        className: 'bg-[#e8f2f4] text-[#7dabb5] dark:bg-[#1e2e32] dark:text-[#80c0cc]',
      },
      LIABILITY: {
        label: language === 'da' ? 'Gæld' : 'Liability',
        className: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300',
      },
      EQUITY: {
        label: language === 'da' ? 'Egenkapital' : 'Equity',
        className: 'bg-[#ebe8fc] text-[#554fe9] dark:bg-[#28273e] dark:text-[#7a76f0]',
      },
      REVENUE: {
        label: language === 'da' ? 'Indtægt' : 'Revenue',
        className: 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300',
      },
      EXPENSE: {
        label: language === 'da' ? 'Omkostning' : 'Expense',
        className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300',
      },
    };
    return map[type] || { label: type, className: 'bg-gray-100 text-gray-700 dark:text-gray-300' };
  };

  // ─── Journal entry total helper ─────────────────────────────────

  const getJournalEntryTotal = (entry: JournalEntry) => {
    return entry.lines.reduce((sum, line) => sum + line.debit, 0);
  };

  // ─── Loading state ──────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-[#554fe9]" />
          <p className="text-gray-500 dark:text-gray-400">{t('loading')}</p>
        </div>
      </div>
    );
  }

  // ─── Double-entry upgrade banner (shown in legacy mode) ─────────

  const DoubleEntryBanner = () => (
    <Card className="border-2 border-dashed border-[#d4c4ae] dark:border-[#5a4e40] bg-gradient-to-r from-[#faf5ee] to-[#f0f5f0] dark:from-[#28273e] dark:to-[#242e26]">
      <CardContent className="p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-[#eeeefa] dark:bg-[#28273e] flex items-center justify-center shrink-0">
            <Sparkles className="h-6 w-6 text-[#554fe9] dark:text-[#7a76f0]" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-gray-900 dark:text-white">
              {language === 'da'
                ? 'Start med dobbeltpostering'
                : 'Start with double-entry bookkeeping'}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
              {language === 'da'
                ? 'Få det fulde overblik med resultatopgørelse, balance og finansjournal. Opret først din kontoplan.'
                : 'Get the full picture with income statement, balance sheet, and journal. Set up your chart of accounts first.'}
            </p>
          </div>
          <Button
            className="btn-primary gap-2 shrink-0"
            onClick={() => onNavigate?.('accounts')}
          >
            <BookOpen className="h-4 w-4" />
            {language === 'da' ? 'Opret kontoplan' : 'Set up chart of accounts'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  // ─── Quick Actions Grid ─────────────────────────────────────────

  const quickActions = [
    {
      key: 'journal',
      title: language === 'da' ? 'Finansjournal' : 'Journal',
      description: language === 'da' ? 'Opret dobbeltposteringer' : 'Create double-entry postings',
      icon: PenLine,
      color: 'text-[#554fe9] dark:text-[#7a76f0]',
      bgColor: 'bg-[#eeeefa] dark:bg-[#28273e]',
    },
    {
      key: 'reports',
      title: language === 'da' ? 'Rapporter' : 'Reports',
      description: language === 'da' ? 'Se resultatopgørelse og balance' : 'View income statement and balance sheet',
      icon: BarChart3,
      color: 'text-[#7c9a82] dark:text-[#8cc492]',
      bgColor: 'bg-[#edf5ef] dark:bg-[#242e26]',
    },
    {
      key: 'bank-recon',
      title: language === 'da' ? 'Bankafstemning' : 'Bank Reconciliation',
      description: language === 'da' ? 'Match banktransaktioner' : 'Match bank transactions',
      icon: Landmark,
      color: 'text-[#7dabb5] dark:text-[#80c0cc]',
      bgColor: 'bg-[#edf4f7] dark:bg-[#242c30]',
    },
    {
      key: 'exports',
      title: language === 'da' ? 'Eksport SAF-T' : 'Export SAF-T',
      description: language === 'da' ? 'Skattestyrelsen revisionsfil' : 'Danish Tax Authority audit file',
      icon: Shield,
      color: 'text-[#c9928f] dark:text-[#d4a5a2]',
      bgColor: 'bg-[#f7eeed] dark:bg-[#2e2524]',
    },
  ];

  // ─── Render ─────────────────────────────────────────────────────

  return (
    <div className="p-4 lg:p-8 space-y-6">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {t('dashboard')}
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            {hasDoubleEntryData
              ? (language === 'da'
                ? `Regnskabsoversigt for ${tm(new Date())}`
                : `Accounting overview for ${tm(new Date())}`)
              : `${t('vatSummary')} ${tm(new Date())}`
            }
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="btn-primary gap-2">
              <Plus className="h-4 w-4" />
              {t('addTransaction')}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto bg-white">
            <DialogHeader>
              <DialogTitle className="dark:text-white flex items-center gap-2">
                <Plus className="h-5 w-5 text-[#554fe9]" />
                {t('addTransaction')}
              </DialogTitle>
              <DialogDescription className="dark:text-gray-400">
                {t('recordNewTransaction')}
              </DialogDescription>
            </DialogHeader>
            <AddTransactionForm onSuccess={handleAddTransaction} />
          </DialogContent>
        </Dialog>
      </div>

      {/* ═══════════════════════════════════════════════════════════
          ONBOARDING (Empty State)
          ═══════════════════════════════════════════════════════════ */}
      {isEmptyState && (
        <div className="space-y-8">
          {/* Hero Section */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#554fe9] via-[#6a66f0] to-[#8580f2] dark:from-[#4a42d0] dark:via-[#3d38a8] dark:to-[#554fe9] p-6 sm:p-10 text-white">
            <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
            <div className="absolute -top-20 -right-20 w-64 h-64 bg-white/5 rounded-full blur-3xl" />
            <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-[#c084fc]/10 rounded-full blur-2xl" />
            <div className="relative flex flex-col sm:flex-row items-center gap-6">
              <div className="shrink-0">
                <Image src="/logo-white.png" alt="AlphaAi Logo" width={180} height={73} className="drop-shadow-lg" />
              </div>
              <div className="text-center sm:text-left flex-1">
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
                  {language === 'da' ? 'Velkommen til AlphaAi Accounting' : 'Welcome to AlphaAi Accounting'}
                </h2>
                <p className="mt-2 text-[#e9d5ff] max-w-xl text-sm sm:text-base opacity-90">
                  {language === 'da'
                    ? 'Kom i gang med din bogføring på få minutter. Følg trinene nedenfor eller prøv appen med demo-data.'
                    : 'Get started with your bookkeeping in minutes. Follow the steps below or try the app with demo data.'}
                </p>
                <div className="mt-4 flex items-center gap-3">
                  <div className="flex-1 max-w-[200px] h-2.5 bg-white/20 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-white to-[#e9d5ff] rounded-full transition-all duration-500 ease-out shadow-sm"
                      style={{ width: `${(completedSteps / onboardingSteps.length) * 100}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium text-[#f3e8ff]">
                    {completedSteps} / {onboardingSteps.length}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* All Steps Complete */}
          {completedSteps === onboardingSteps.length && (
            <Card className="border-2 border-[#7c9a82] dark:border-[#5a8a5e] bg-gradient-to-r from-[#edf5ef] to-[#f0f5f0] dark:from-[#1e2e22] dark:to-[#1a2820]">
              <CardContent className="p-6 text-center">
                <div className="h-14 w-14 mx-auto rounded-full bg-[#edf5ef] dark:bg-[#1e2e22] flex items-center justify-center mb-3">
                  <CheckCircle2 className="h-7 w-7 text-[#7c9a82] dark:text-[#8cc492]" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                  {language === 'da' ? 'Alle trin er gennemført!' : 'All steps complete!'}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {language === 'da' ? 'Du er klar til at bruge AlphaAi Accounting' : 'You\'re ready to use AlphaAi Accounting'}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Load Demo Data Button */}
          <div className="flex items-center justify-center">
            <div className="flex flex-col items-center gap-3 py-2">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-[#6a66f0] to-[#8580f2] rounded-full blur-md opacity-40" />
                <Button
                  variant="outline"
                  className="relative gap-2.5 px-6 py-5 border-2 border-dashed border-[#6a66f0]/50 dark:border-[#9b96f5]/50 hover:border-[#6a66f0] dark:hover:border-[#9b96f5] hover:bg-[#f5f3ff] dark:hover:bg-[#2e1065]/30 transition-all duration-300 rounded-xl text-[#554fe9] dark:text-[#9b96f5]"
                  onClick={handleLoadDemoData}
                  disabled={isSeeding}
                >
                  {isSeeding ? (
                    <Loader2 className="h-5 w-5 animate-spin text-[#6a66f0]" />
                  ) : (
                    <Wand2 className="h-5 w-5 text-[#6a66f0]" />
                  )}
                  <span className="text-sm font-semibold">
                    {isSeeding
                      ? (language === 'da' ? 'Opretter demo-data...' : 'Creating demo data...')
                      : (language === 'da' ? 'Indlæs demo-data' : 'Load Demo Data')
                    }
                  </span>
                </Button>
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500 text-center max-w-[300px]">
                {language === 'da'
                  ? 'Opret realistisk demo-data til at teste appen. Demo-data kan slettes når som helst.'
                  : 'Create realistic demo data to test the app. Demo data can be deleted anytime.'
                }
              </p>
            </div>
          </div>

          {/* Setup Step Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {onboardingSteps.map((step) => {
              const StepIcon = step.icon;
              return (
                <Card
                  key={step.key}
                  className={`relative overflow-hidden rounded-xl border transition-all duration-300 group cursor-pointer hover:shadow-lg hover:-translate-y-0.5 ${
                    step.done
                      ? 'border-[#7c9a82]/40 dark:border-[#7c9a82]/30 bg-[#edf5ef]/50 dark:bg-[#1e2e22]/30 hover:border-[#7c9a82] dark:hover:border-[#7c9a82]'
                      : 'border-gray-200 dark:border-gray-700/50 bg-white dark:bg-gray-900 hover:border-[#554fe9]/30 dark:hover:border-[#7a76f0]/30'
                  }`}
                  onClick={step.action}
                >
                  <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${step.gradient}`} />
                  <CardContent className="p-5 pt-6">
                    <div className="flex items-start gap-4">
                      <div className="flex flex-col items-center gap-2 shrink-0">
                        <div className={`h-10 w-10 rounded-xl ${step.iconBg} flex items-center justify-center transition-all duration-300`}>
                          {step.done ? (
                            <CheckCircle2 className="h-5 w-5 text-[#7c9a82] dark:text-[#8cc492]" />
                          ) : (
                            <StepIcon className={`h-5 w-5 ${step.iconColor}`} />
                          )}
                        </div>
                        <span className={`text-xs font-bold ${step.done ? 'text-[#7c9a82] dark:text-[#8cc492]' : 'text-gray-400 dark:text-gray-500'}`}>
                          {step.done ? (language === 'da' ? 'Færdig' : 'Done') : `${step.step}/4`}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className={`font-semibold text-sm sm:text-base ${
                          step.done
                            ? 'text-gray-500 dark:text-gray-400 line-through decoration-[#7c9a82]'
                            : 'text-gray-900 dark:text-white'
                        }`}>
                          {step.title}
                        </h3>
                        <p className={`text-xs sm:text-sm mt-1 ${
                          step.done ? 'text-gray-400 dark:text-gray-500' : 'text-gray-500 dark:text-gray-400'
                        }`}>
                          {step.description}
                        </p>
                      </div>
                      <div className="shrink-0 mt-1">
                        {step.done ? (
                          <Badge className="bg-[#edf5ef] text-[#7c9a82] dark:bg-[#1e2e22] dark:text-[#8cc492] text-xs font-medium px-2 py-0.5">
                            {language === 'da' ? 'Færdig' : 'Done'}
                          </Badge>
                        ) : (
                          <Button
                            size="sm"
                            className={`gap-1.5 text-xs bg-gradient-to-r ${step.gradient} text-white border-0 shadow-sm hover:opacity-90 transition-opacity`}
                            onClick={(e) => { e.stopPropagation(); step.action(); }}
                          >
                            {language === 'da' ? 'Start' : 'Get Started'}
                            <ArrowRight className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Demo Mode Banner */}
      {demoModeEnabled && !isEmptyState && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 border border-amber-200 dark:border-amber-800/50">
          <div className="h-10 w-10 rounded-full bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center shrink-0">
            <Eye className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
              {language === 'da' ? 'Demo-tilstand aktiv' : 'Demo Mode Active'}
            </p>
            <p className="text-xs text-amber-600 dark:text-amber-400">
              {language === 'da'
                ? 'Du ser demo-data. Din rigtige data er sikret. Klik for at afslutte demo-tilstand.'
                : 'You are viewing demo data. Your live data is safe. Click to exit demo mode.'}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-2 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/30"
            onClick={handleToggleDemoMode}
          >
            <EyeOff className="h-4 w-4" />
            {language === 'da' ? 'Afslut demo' : 'Exit Demo'}
          </Button>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
          MODE: Double-Entry Dashboard
          ═══════════════════════════════════════════════════════════ */}

      {hasDoubleEntryData && (
        <>
          {/* ─── 6 KPI Stat Cards ──────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* 1. Omsætning (Revenue) */}
            <Card className="stat-card">
              <CardContent className="p-3 sm:p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                      {language === 'da' ? 'Omsætning' : 'Revenue'}
                    </p>
                    <p className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white mt-0.5 sm:mt-1">
                      {tc(incomeStatement?.grossProfit.revenue || 0)}
                    </p>
                  </div>
                  <div className="h-9 w-9 sm:h-12 sm:w-12 rounded-full stat-icon-primary flex items-center justify-center">
                    <TrendingUp className="h-4 w-4 sm:h-6 sm:w-6 text-[#554fe9] dark:text-[#7a76f0]" />
                  </div>
                </div>
                <div className="mt-1.5 sm:mt-3 flex items-center text-xs sm:text-sm text-[#554fe9] dark:text-[#7a76f0]">
                  <TrendingUp className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                  {language === 'da' ? 'År til dato' : 'Year to date'}
                </div>
              </CardContent>
            </Card>

            {/* 2. Årets resultat (Net Result) */}
            <Card className="stat-card">
              <CardContent className="p-3 sm:p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                      {language === 'da' ? 'Årets resultat' : 'Net Result'}
                    </p>
                    <p className={`text-lg sm:text-2xl font-bold mt-0.5 sm:mt-1 ${
                      (incomeStatement?.netResult || 0) >= 0 ? 'text-[#5a8a5e] dark:text-[#8cc492]' : 'text-[#c75450] dark:text-[#e06b67]'
                    }`}>
                      {tc(incomeStatement?.netResult || 0)}
                    </p>
                  </div>
                  <div className={`h-9 w-9 sm:h-12 sm:w-12 rounded-full flex items-center justify-center ${
                    (incomeStatement?.netResult || 0) >= 0 ? 'stat-icon-green' : 'stat-icon-red'
                  }`}>
                    <Scale className={`h-4 w-4 sm:h-6 sm:w-6 ${
                      (incomeStatement?.netResult || 0) >= 0 ? 'text-[#5a8a5e] dark:text-[#8cc492]' : 'text-[#c75450] dark:text-[#e06b67]'
                    }`} />
                  </div>
                </div>
                <div className="mt-1.5 sm:mt-3 flex items-center text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                  <Scale className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                  {language === 'da' ? 'Driftsresultat + finans' : 'Operating + financial'}
                </div>
              </CardContent>
            </Card>

            {/* 3. D Moms (Output VAT) */}
            <Card className="stat-card">
              <CardContent className="p-3 sm:p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                      {language === 'da' ? 'Udgående moms' : 'Output VAT'}
                    </p>
                    <p className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white mt-0.5 sm:mt-1">
                      {tc(outputVAT)}
                    </p>
                  </div>
                  <div className="h-9 w-9 sm:h-12 sm:w-12 rounded-full stat-icon-amber flex items-center justify-center">
                    <ArrowUpRight className="h-4 w-4 sm:h-6 sm:w-6 text-[#6a66d8] dark:text-[#d4b06e]" />
                  </div>
                </div>
                <div className="mt-1.5 sm:mt-3 flex items-center text-xs sm:text-sm text-[#6a66d8] dark:text-[#d4b06e]">
                  <ArrowUpRight className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                  {vatRegister ? (language === 'da' ? 'Fra momsregister' : 'From VAT register') : (language === 'da' ? 'Ca. 25% af omsætning' : 'Est. 25% of revenue')}
                </div>
              </CardContent>
            </Card>

            {/* 4. Indgående moms (Input VAT) */}
            <Card className="stat-card">
              <CardContent className="p-3 sm:p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                      {language === 'da' ? 'Indgående moms' : 'Input VAT'}
                    </p>
                    <p className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white mt-0.5 sm:mt-1">
                      {tc(inputVAT)}
                    </p>
                  </div>
                  <div className="h-9 w-9 sm:h-12 sm:w-12 rounded-full stat-icon-green flex items-center justify-center">
                    <ArrowDownRight className="h-4 w-4 sm:h-6 sm:w-6 text-[#5a8a5e] dark:text-[#8cc492]" />
                  </div>
                </div>
                <div className="mt-1.5 sm:mt-3 flex items-center text-xs sm:text-sm text-[#5a8a5e] dark:text-[#8cc492]">
                  <ArrowDownRight className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                  {language === 'da' ? 'Købsmoms' : 'Purchase VAT'}
                </div>
              </CardContent>
            </Card>

            {/* 5. At betale / Til refusion (Net VAT) */}
            <Card className="stat-card">
              <CardContent className="p-3 sm:p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                      {netVAT >= 0 ? (language === 'da' ? 'At betale' : 'To pay') : (language === 'da' ? 'Til refusion' : 'Refund')}
                    </p>
                    <p className={`text-lg sm:text-2xl font-bold mt-0.5 sm:mt-1 ${
                      netVAT >= 0 ? 'text-[#c75450] dark:text-[#e06b67]' : 'text-[#5a8a5e] dark:text-[#8cc492]'
                    }`}>
                      {tc(Math.abs(netVAT))}
                    </p>
                  </div>
                  <div className={`h-9 w-9 sm:h-12 sm:w-12 rounded-full flex items-center justify-center ${
                    netVAT >= 0 ? 'stat-icon-red' : 'stat-icon-green'
                  }`}>
                    {netVAT >= 0
                      ? <Calculator className="h-4 w-4 sm:h-6 sm:w-6 text-[#c75450] dark:text-[#e06b67]" />
                      : <RefreshCw className="h-4 w-4 sm:h-6 sm:w-6 text-[#5a8a5e] dark:text-[#8cc492]" />
                    }
                  </div>
                </div>
                <div className={`mt-1.5 sm:mt-3 flex items-center text-xs sm:text-sm ${
                  netVAT >= 0 ? 'text-[#c75450] dark:text-[#e06b67]' : 'text-[#5a8a5e] dark:text-[#8cc492]'
                }`}>
                  {netVAT >= 0
                    ? <><ArrowUpRight className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />{language === 'da' ? 'Udgående - Indgående' : 'Output - Input'}</>
                    : <><ArrowDownLeft className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />{language === 'da' ? 'Indgående > Udgående' : 'Input > Output'}</>
                  }
                </div>
              </CardContent>
            </Card>

            {/* 4. Egenkapital (Equity) */}
            <Card className="stat-card">
              <CardContent className="p-3 sm:p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                      {language === 'da' ? 'Egenkapital' : 'Equity'}
                    </p>
                    <p className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white mt-0.5 sm:mt-1">
                      {tc(balanceSheet?.equity.totalEquity || 0)}
                    </p>
                  </div>
                  <div className="h-9 w-9 sm:h-12 sm:w-12 rounded-full stat-icon-blue flex items-center justify-center">
                    <BookOpen className="h-4 w-4 sm:h-6 sm:w-6 text-[#7dabb5] dark:text-[#80c0cc]" />
                  </div>
                </div>
                <div className="mt-1.5 sm:mt-3 flex items-center text-xs sm:text-sm text-[#7dabb5] dark:text-[#80c0cc]">
                  <BookOpen className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                  {language === 'da' ? 'Kapital + overført resultat' : 'Capital + retained earnings'}
                </div>
              </CardContent>
            </Card>

            {/* 5. Aktiver (Assets) */}
            <Card className="stat-card">
              <CardContent className="p-3 sm:p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                      {language === 'da' ? 'Aktiver' : 'Assets'}
                    </p>
                    <p className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white mt-0.5 sm:mt-1">
                      {tc(balanceSheet?.assets.totalAssets || 0)}
                    </p>
                  </div>
                  <div className="h-9 w-9 sm:h-12 sm:w-12 rounded-full stat-icon-green flex items-center justify-center">
                    <Landmark className="h-4 w-4 sm:h-6 sm:w-6 text-[#5a8a5e] dark:text-[#8cc492]" />
                  </div>
                </div>
                <div className="mt-1.5 sm:mt-3 flex items-center text-xs sm:text-sm text-[#5a8a5e] dark:text-[#8cc492]">
                  <Landmark className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                  {language === 'da' ? 'Omsætnings- + anlægsaktiver' : 'Current + fixed assets'}
                </div>
              </CardContent>
            </Card>

            {/* 6. Gæld (Liabilities) */}
            <Card className="stat-card">
              <CardContent className="p-3 sm:p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                      {language === 'da' ? 'Gæld' : 'Liabilities'}
                    </p>
                    <p className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white mt-0.5 sm:mt-1">
                      {tc(balanceSheet?.liabilities.totalLiabilities || 0)}
                    </p>
                  </div>
                  <div className="h-9 w-9 sm:h-12 sm:w-12 rounded-full stat-icon-red flex items-center justify-center">
                    <AlertTriangle className="h-4 w-4 sm:h-6 sm:w-6 text-[#c75450] dark:text-[#e06b67]" />
                  </div>
                </div>
                <div className="mt-1.5 sm:mt-3 flex items-center text-xs sm:text-sm text-[#c75450] dark:text-[#e06b67]">
                  <AlertTriangle className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                  {language === 'da' ? 'Kort- + langfristet gæld' : 'Short + long-term debt'}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ─── Quick Actions Grid ─────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {quickActions.map((action) => (
              <Card
                key={action.key}
                className="rounded-xl border border-gray-200 dark:border-gray-700 hover:shadow-lg transition-all cursor-pointer group"
                onClick={() => onNavigate?.(action.key)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <div className={`h-11 w-11 rounded-xl ${action.bgColor} flex items-center justify-center shrink-0`}>
                      <action.icon className={`h-5 w-5 ${action.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 dark:text-white text-sm sm:text-base">
                        {action.title}
                      </h3>
                      <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 truncate">
                        {action.description}
                      </p>
                    </div>
                    <div className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <ChevronRight className="h-5 w-5 text-gray-400" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* ─── Charts Row ─────────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* VAT Breakdown Pie Chart */}
            <Card className="stat-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <Calculator className="h-5 w-5 text-[#554fe9]" />
                  {t('vatBreakdown')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {vatBreakdown.length > 0 ? (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={vatBreakdown}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={90}
                          paddingAngle={5}
                          dataKey="vat"
                        >
                          {vatBreakdown.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <RechartsTooltip
                          formatter={(value: number) => tc(value)}
                          contentStyle={RECHARTS_TOOLTIP_STYLE_LIGHT}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-64 flex items-center justify-center text-gray-500 dark:text-gray-400">
                    {language === 'da' ? 'Ingen salg denne måned' : 'No sales this month'}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Monthly Revenue vs Expenses Chart */}
            <Card className="stat-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-[#554fe9]" />
                  {language === 'da' ? 'Omsætning vs Omkostninger' : 'Revenue vs Expenses'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {monthlyRevenueChart.length > 0 ? (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={monthlyRevenueChart} barGap={2} barCategoryGap="20%">
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(168, 124, 86, 0.1)" />
                        <XAxis dataKey="label" stroke="#b0a89e" fontSize={12} />
                        <YAxis stroke="#b0a89e" fontSize={12} tickFormatter={(v) => `${v / 1000}k`} />
                        <RechartsTooltip
                          formatter={(value: number, name: string) => {
                            if (name === 'revenue') return [tc(value), language === 'da' ? 'Omsætning' : 'Revenue'];
                            if (name === 'expenses') return [tc(value), language === 'da' ? 'Omkostninger' : 'Expenses'];
                            return [tc(value), name];
                          }}
                          contentStyle={RECHARTS_TOOLTIP_STYLE_LIGHT}
                        />
                        <Legend
                          formatter={(value) => {
                            if (value === 'revenue') return language === 'da' ? 'Omsætning' : 'Revenue';
                            if (value === 'expenses') return language === 'da' ? 'Omkostninger' : 'Expenses';
                            return value;
                          }}
                          wrapperStyle={{ fontSize: '12px', color: '#b0a89e' }}
                        />
                        <Bar dataKey="revenue" fill="#7c9a82" radius={[4, 4, 0, 0]} name="revenue" />
                        <Bar dataKey="expenses" fill="#c9928f" radius={[4, 4, 0, 0]} name="expenses" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-64 flex items-center justify-center text-gray-500 dark:text-gray-400">
                    {language === 'da' ? 'Ingen dobbeltposteringsdata' : 'No double-entry data'}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ─── Net Revenue Area Chart ─────────────────────────── */}
          {monthlyRevenueChart.some((m) => m.revenue !== 0 || m.expenses !== 0) && (
            <Card className="stat-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-[#554fe9]" />
                  {language === 'da' ? 'Netto resultat pr. måned' : 'Net Result by Month'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={monthlyRevenueChart}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(168, 124, 86, 0.1)" />
                      <XAxis dataKey="label" stroke="#b0a89e" fontSize={12} />
                      <YAxis stroke="#b0a89e" fontSize={12} tickFormatter={(v) => `${v / 1000}k`} />
                      <RechartsTooltip
                        formatter={(value: number) => [tc(value), language === 'da' ? 'Netto' : 'Net']}
                        contentStyle={RECHARTS_TOOLTIP_STYLE_LIGHT}
                      />
                      <defs>
                        <linearGradient id="netGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#554fe9" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="#554fe9" stopOpacity={0.03} />
                        </linearGradient>
                      </defs>
                      <Area
                        type="monotone"
                        dataKey="net"
                        stroke="#554fe9"
                        fill="url(#netGradient)"
                        strokeWidth={2}
                        name="net"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ─── Recent Journal Entries ─────────────────────────── */}
          <Card className="stat-card">
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <PenLine className="h-5 w-5 text-[#554fe9]" />
                {language === 'da' ? 'Seneste journalposter' : 'Recent Journal Entries'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {journalEntries.length === 0 ? (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  {language === 'da' ? 'Inge journalposter endnu' : 'No journal entries yet'}
                </div>
              ) : (
                <div className="space-y-3">
                  {journalEntries.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between p-4 rounded-xl bg-gray-50/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                      onClick={() => onNavigate?.('journal')}
                    >
                      <div className="flex items-center gap-4">
                        <div className="h-10 w-10 rounded-full bg-[#ebe8fc] dark:bg-[#28273e] flex items-center justify-center">
                          <PenLine className="h-5 w-5 text-[#554fe9] dark:text-[#7a76f0]" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">
                            {entry.description}
                          </p>
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            {td(new Date(entry.date))}
                            {entry.reference && (
                              <span className="ml-2 text-xs bg-gray-200 dark:bg-gray-700 px-1.5 py-0.5 rounded">
                                {entry.reference}
                              </span>
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="font-semibold text-gray-900 dark:text-white">
                            {tc(getJournalEntryTotal(entry))}
                          </p>
                          <Badge
                            variant="secondary"
                            className="text-[10px] px-1.5 py-0 bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300"
                          >
                            {entry.status}
                          </Badge>
                        </div>
                        <ArrowRight className="h-4 w-4 text-gray-400" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* ─── Account Balance Overview ───────────────────────── */}
          {topAccounts.length > 0 && (
            <Card className="stat-card">
              <CardHeader>
                <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-[#554fe9]" />
                  {language === 'da' ? 'Mest aktive konti' : 'Most Active Accounts'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-2 px-3 text-gray-500 dark:text-gray-400 font-medium">
                          {language === 'da' ? 'Konto' : 'Account'}
                        </th>
                        <th className="text-left py-2 px-3 text-gray-500 dark:text-gray-400 font-medium">
                          {language === 'da' ? 'Navn' : 'Name'}
                        </th>
                        <th className="text-right py-2 px-3 text-gray-500 dark:text-gray-400 font-medium">
                          {language === 'da' ? 'Saldo' : 'Balance'}
                        </th>
                        <th className="text-right py-2 px-3 text-gray-500 dark:text-gray-400 font-medium">
                          {language === 'da' ? 'Type' : 'Type'}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {topAccounts.map((acc) => {
                        const badgeInfo = getAccountTypeBadge(acc.accountType);
                        return (
                          <tr
                            key={acc.accountId}
                            className="border-b border-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                          >
                            <td className="py-2.5 px-3 font-mono text-gray-900 dark:text-white">
                              {acc.accountNumber}
                            </td>
                            <td className="py-2.5 px-3 text-gray-700 dark:text-gray-300">
                              {acc.accountName}
                            </td>
                            <td className={`py-2.5 px-3 text-right font-semibold ${
                              acc.balance >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                            }`}>
                              {tc(acc.balance)}
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${badgeInfo.className}`}>
                                {badgeInfo.label}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════
          MODE: Legacy Dashboard (no double-entry data)
          ═══════════════════════════════════════════════════════════ */}

      {!hasDoubleEntryData && (
        <>
          {/* Upgrade Banner */}
          <DoubleEntryBanner />

          {/* Main Stats Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Output VAT (Sales) */}
            <Card className="stat-card">
              <CardContent className="p-3 sm:p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">{t('outputVAT')}</p>
                    <p className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white mt-0.5 sm:mt-1">
                      {tc(stats.thisMonth.outputVAT)}
                    </p>
                  </div>
                  <div className="h-9 w-9 sm:h-12 sm:w-12 rounded-full stat-icon-amber flex items-center justify-center">
                    <ArrowUpRight className="h-4 w-4 sm:h-6 sm:w-6 text-orange-500 dark:text-orange-400" />
                  </div>
                </div>
                <div className="mt-1.5 sm:mt-3 flex items-center text-xs sm:text-sm text-orange-500 dark:text-orange-400">
                  <TrendingUp className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                  {t('salesVAT')} ({stats.thisMonth.salesCount})
                </div>
              </CardContent>
            </Card>

            {/* Input VAT (Purchases) */}
            <Card className="stat-card">
              <CardContent className="p-3 sm:p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">{t('inputVAT')}</p>
                    <p className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white mt-0.5 sm:mt-1">
                      {tc(stats.thisMonth.inputVAT)}
                    </p>
                  </div>
                  <div className="h-9 w-9 sm:h-12 sm:w-12 rounded-full stat-icon-amber flex items-center justify-center">
                    <ArrowDownRight className="h-4 w-4 sm:h-6 sm:w-6 text-amber-600 dark:text-amber-400" />
                  </div>
                </div>
                <div className="mt-1.5 sm:mt-3 flex items-center text-xs sm:text-sm text-green-600 dark:text-green-400">
                  <Receipt className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                  {t('purchaseVATDeductible')} ({stats.thisMonth.purchasesCount})
                </div>
              </CardContent>
            </Card>

            {/* Net VAT */}
            <Card className="stat-card">
              <CardContent className="p-3 sm:p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                      {stats.thisMonth.netVAT >= 0 ? t('toPay') : t('toRefund')}
                    </p>
                    <p className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white mt-0.5 sm:mt-1">
                      {tc(Math.abs(stats.thisMonth.netVAT))}
                    </p>
                  </div>
                  <div className={`h-9 w-9 sm:h-12 sm:w-12 rounded-full flex items-center justify-center ${stats.thisMonth.netVAT >= 0 ? 'stat-icon-red' : 'stat-icon-green'}`}>
                    <Calculator className={`h-4 w-4 sm:h-6 sm:w-6 ${stats.thisMonth.netVAT >= 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`} />
                  </div>
                </div>
                <div className="mt-1.5 sm:mt-3 flex items-center text-xs sm:text-sm text-red-600 dark:text-red-400">
                  <Calculator className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                  {language === 'da' ? 'Udgående - Indgående' : 'Output - Input'}
                </div>
              </CardContent>
            </Card>

            {/* Total Revenue All Time */}
            <Card className="stat-card">
              <CardContent className="p-3 sm:p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">{t('totalRevenue')}</p>
                    <p className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white mt-0.5 sm:mt-1">
                      {tc(stats.all.totalRevenue)}
                    </p>
                  </div>
                  <div className="h-9 w-9 sm:h-12 sm:w-12 rounded-full stat-icon-blue flex items-center justify-center">
                    <FileText className="h-4 w-4 sm:h-6 sm:w-6 text-[#7dabb5] dark:text-[#80c0cc]" />
                  </div>
                </div>
                <div className="mt-1.5 sm:mt-3 flex items-center text-xs sm:text-sm text-[#7dabb5] dark:text-[#80c0cc]">
                  <FileText className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                  {language === 'da' ? 'Salg (ekskl. moms)' : 'Sales (excl. VAT)'}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* VAT Breakdown Pie Chart */}
            <Card className="stat-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <Calculator className="h-5 w-5 text-[#554fe9]" />
                  {t('vatBreakdown')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {vatBreakdown.length > 0 ? (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={vatBreakdown}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={90}
                          paddingAngle={5}
                          dataKey="vat"
                        >
                          {vatBreakdown.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <RechartsTooltip
                          formatter={(value: number) => tc(value)}
                          contentStyle={RECHARTS_TOOLTIP_STYLE_LIGHT}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-64 flex items-center justify-center text-gray-500 dark:text-gray-400">
                    {language === 'da' ? 'Ingen salg denne måned' : 'No sales this month'}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Monthly Net VAT Trend Chart */}
            <Card className="stat-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-[#554fe9]" />
                  {t('monthlyTrend')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {monthlyTrend.length > 0 ? (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={monthlyTrend} barGap={4} barCategoryGap="20%">
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(168, 124, 86, 0.1)" />
                        <XAxis dataKey="label" stroke="#b0a89e" fontSize={12} />
                        <YAxis stroke="#b0a89e" fontSize={12} tickFormatter={(v) => `${v / 1000}k`} />
                        <RechartsTooltip
                          formatter={(value: number, name: string) => {
                            if (name === 'netVat') return [tc(value), language === 'da' ? 'Net moms' : 'Net VAT'];
                            if (name === 'outputVat') return [tc(value), language === 'da' ? 'Udgående moms' : 'Output VAT'];
                            if (name === 'inputVat') return [tc(value), language === 'da' ? 'Indgående moms' : 'Input VAT'];
                            return [tc(value), name];
                          }}
                          contentStyle={RECHARTS_TOOLTIP_STYLE_LIGHT}
                        />
                        <Bar dataKey="outputVat" fill="#c9a87c" radius={[4, 4, 0, 0]} name="Output" />
                        <Bar dataKey="inputVat" fill="#7dabb5" radius={[4, 4, 0, 0]} name="Input" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-64 flex items-center justify-center text-gray-500 dark:text-gray-400">
                    {language === 'da' ? 'Ingen data tilgængelig' : 'No data available'}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* SAF-T Quick Action */}
          <Card className="stat-card cursor-pointer hover:shadow-lg transition-all" onClick={() => onNavigate?.('exports')}>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-[#554fe9] to-[#4a42d0] flex items-center justify-center shrink-0 shadow-md">
                  <Shield className="h-7 w-7 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-gray-900 dark:text-white text-lg">
                    {t('saftExport')}
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {language === 'da'
                      ? 'Generer Skattestyrelsen-kompatibel revisionsfil'
                      : 'Generate Danish Tax Authority compliant audit file'}
                  </p>
                </div>
                <div className="shrink-0">
                  <Button variant="outline" size="sm" className="gap-2 border-[#e2d8d0] text-[#554fe9] hover:bg-[#ebe8fc] dark:border-[#7a76f0] dark:text-[#7a76f0] dark:hover:bg-[#302b26]">
                    <FileText className="h-4 w-4" />
                    {language === 'da' ? 'Generer' : 'Generate'}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Additional Stats Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="stat-card">
              <CardContent className="p-3 sm:p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">{t('transactions')}</p>
                    <p className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white mt-0.5 sm:mt-1">
                      {stats.thisMonth.count}
                    </p>
                  </div>
                  <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-full stat-icon-purple flex items-center justify-center">
                    <Receipt className="h-4 w-4 sm:h-5 sm:w-5 text-[#554fe9] dark:text-[#7a76f0]" />
                  </div>
                </div>
                <p className="text-[10px] sm:text-xs text-gray-400 mt-0.5 sm:mt-1">
                  {stats.thisMonth.salesCount} {language === 'da' ? 'salg' : 'sales'} / {stats.thisMonth.purchasesCount} {language === 'da' ? 'køb' : 'purchases'}
                </p>
              </CardContent>
            </Card>

            <Card className="stat-card">
              <CardContent className="p-3 sm:p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">{t('sales')}</p>
                    <p className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white mt-0.5 sm:mt-1">
                      {tc(stats.thisMonth.salesAmount)}
                    </p>
                  </div>
                  <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-full stat-icon-green flex items-center justify-center">
                    <ArrowUpRight className="h-4 w-4 sm:h-5 sm:w-5 text-green-600 dark:text-green-400" />
                  </div>
                </div>
                <p className="text-[10px] sm:text-xs text-gray-400 mt-0.5 sm:mt-1">
                  {language === 'da' ? 'Salg (ekskl. moms)' : 'Sales (excl. VAT)'}
                </p>
              </CardContent>
            </Card>

            <Card className="stat-card">
              <CardContent className="p-3 sm:p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">{language === 'da' ? 'Moms i alt' : 'All-time VAT'}</p>
                    <p className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white mt-0.5 sm:mt-1">
                      {tc(stats.all.netVAT)}
                    </p>
                  </div>
                  <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-full stat-icon-blue flex items-center justify-center">
                    <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5 text-[#7dabb5] dark:text-[#80c0cc]" />
                  </div>
                </div>
                <p className="text-[10px] sm:text-xs text-gray-400 mt-0.5 sm:mt-1">
                  {language === 'da' ? 'Net (udgående - indgående)' : 'Net (output - input)'}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Recent Transactions */}
          <Card className="stat-card">
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <Zap className="h-5 w-5 text-[#554fe9]" />
                {t('recentTransactions')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {transactions.length === 0 ? (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  {t('noTransactionsYet')}
                </div>
              ) : (
                <div className="space-y-3">
                  {transactions.slice(0, 5).map((transaction) => (
                    <div
                      key={transaction.id}
                      className="flex items-center justify-between p-4 rounded-xl bg-gray-50/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div className={`h-10 w-10 rounded-full flex items-center justify-center ${
                          transaction.type === 'PURCHASE'
                            ? 'bg-amber-100 dark:bg-amber-900/50'
                            : 'bg-[#ebe8fc] dark:bg-[#28273e]'
                        }`}>
                          {transaction.type === 'PURCHASE' ? (
                            <ArrowDownRight className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                          ) : (
                            <ArrowUpRight className="h-5 w-5 text-[#554fe9] dark:text-[#7a76f0]" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">
                            {transaction.description}
                          </p>
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            {td(new Date(transaction.date))}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="font-semibold text-gray-900 dark:text-white">
                            {tc(transaction.amount)}
                          </p>
                          <p className={`text-sm ${transaction.type === 'PURCHASE' ? 'text-amber-600 dark:text-amber-400' : 'text-[#554fe9] dark:text-[#7a76f0]'}`}>
                            {transaction.type === 'PURCHASE' ? '-' : '+'}{tc((transaction.amount * transaction.vatPercent) / 100)} {language === 'da' ? 'moms' : 'VAT'}
                          </p>
                        </div>
                        {!transaction.id.startsWith('inv-') && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleExportPeppol(transaction.id);
                                  }}
                                  disabled={exportingId === transaction.id}
                                  className="text-gray-400 hover:text-[#554fe9] dark:hover:text-[#7a76f0]"
                                >
                                  <FileText className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Export OIOUBL</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
