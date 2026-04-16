'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { User } from '@/lib/auth-store';
import { useTranslation } from '@/lib/use-translation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { AddTransactionForm } from '@/components/transaction/add-transaction-form';
import {
  Plus,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Trash2,
  Eye,
  FileText,
  Loader2,
  Filter,
  X,
  Receipt,
  ArrowUpCircle,
  ArrowDownCircle,
  Upload,
  Paperclip,
  AlertCircle,
  Camera,
} from 'lucide-react';
import { format } from 'date-fns';

interface Transaction {
  id: string;
  date: string;
  type: 'SALE' | 'PURCHASE' | 'SALARY' | 'BANK' | 'Z_REPORT' | 'PRIVATE' | 'ADJUSTMENT';
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

interface TransactionsPageProps {
  user: User;
}

type SortField = 'date' | 'amount' | 'vatPercent';
type SortDirection = 'asc' | 'desc';

export function TransactionsPage({ user }: TransactionsPageProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<string | null>(null);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const { t, tc, td, language } = useTranslation();

  // Receipt upload state
  const [uploadDialogTransactionId, setUploadDialogTransactionId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState('');
  const uploadInputRef = useRef<HTMLInputElement>(null);

  // Filter & Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [vatFilter, setVatFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Helper: get receipt image URL from stored path
  const getReceiptUrl = useCallback((receiptImage: string | null) => {
    if (!receiptImage) return null;
    // Convert "uploads/receipts/{userId}/{file}" to "/api/receipts/receipts/{userId}/{file}"
    return `/api/receipts/${receiptImage}`;
  }, []);

  const fetchTransactions = useCallback(async () => {
    try {
      // Fetch both transactions and invoices in parallel
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

      // Collect IDs of invoices that already have transactions (to avoid double-counting)
      const invoiceIdsWithTransactions = new Set(
        allTransactions
          .filter((tx) => tx.invoiceId)
          .map((tx) => tx.invoiceId)
      );

      // For invoices without transactions, create virtual transactions from line items
      const virtualTransactions: Transaction[] = [];

      for (const invoice of invoices) {
        if (invoice.status === 'CANCELLED') continue;
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

      // Merge real transactions with virtual ones from invoices
      setTransactions([...allTransactions, ...virtualTransactions]);
    } catch (error) {
      console.error('Failed to fetch transactions:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  const handleAddTransaction = useCallback(() => {
    setIsDialogOpen(false);
    fetchTransactions();
  }, [fetchTransactions]);

  const handleDeleteTransaction = useCallback(
    async (id: string) => {
      try {
        await fetch(`/api/transactions?id=${id}`, { method: 'DELETE' });
        fetchTransactions();
      } catch (error) {
        console.error('Failed to delete transaction:', error);
      }
    },
    [fetchTransactions]
  );

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

  // Handle file selection for upload-to-existing-transaction
  const handleUploadFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      // Validate
      if (file.size > 10 * 1024 * 1024) {
        setUploadError(language === 'da' ? 'Filstørrelsen skal være under 10MB' : 'File size must be less than 10MB');
        return;
      }

      setUploadFile(file);
      setUploadError('');

      // Create preview
      const reader = new FileReader();
      reader.onload = () => {
        setUploadPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    },
    [language]
  );

  // Upload receipt to existing transaction
  const handleUploadReceipt = useCallback(async () => {
    if (!uploadFile || !uploadDialogTransactionId) return;

    setIsUploading(true);
    setUploadError('');

    try {
      // Upload file
      const formData = new FormData();
      formData.append('file', uploadFile);

      const uploadResponse = await fetch('/api/transactions/upload', {
        method: 'POST',
        body: formData,
      });

      if (!uploadResponse.ok) {
        throw new Error(language === 'da' ? 'Kunne ikke uploade kvittering' : 'Failed to upload receipt');
      }

      const uploadData = await uploadResponse.json();

      // Update transaction with receipt path
      const updateResponse = await fetch('/api/transactions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: uploadDialogTransactionId,
          receiptImage: uploadData.path,
        }),
      });

      if (!updateResponse.ok) {
        throw new Error(language === 'da' ? 'Kunne ikke opdatere transaktion' : 'Failed to update transaction');
      }

      // Close dialog and refresh
      closeUploadDialog();
      fetchTransactions();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : (language === 'da' ? 'Der opstod en fejl' : 'An error occurred'));
    } finally {
      setIsUploading(false);
    }
  }, [uploadFile, uploadDialogTransactionId, language, fetchTransactions]);

  // Remove receipt from transaction
  const handleRemoveReceipt = useCallback(
    async (transactionId: string) => {
      try {
        const updateResponse = await fetch('/api/transactions', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: transactionId,
            receiptImage: null,
          }),
        });

        if (!updateResponse.ok) {
          throw new Error('Failed to remove receipt');
        }

        setSelectedReceipt(null);
        fetchTransactions();
      } catch (error) {
        console.error('Failed to remove receipt:', error);
      }
    },
    [fetchTransactions]
  );

  // Open upload dialog for a specific transaction
  const openUploadDialog = useCallback((transactionId: string) => {
    setUploadDialogTransactionId(transactionId);
    setUploadFile(null);
    setUploadPreview(null);
    setUploadError('');
    setIsUploading(false);
    if (uploadInputRef.current) {
      uploadInputRef.current.value = '';
    }
  }, []);

  const closeUploadDialog = useCallback(() => {
    setUploadDialogTransactionId(null);
    setUploadFile(null);
    setUploadPreview(null);
    setUploadError('');
    setIsUploading(false);
  }, []);

  // Get unique VAT rates for filter
  const vatRates = useMemo(() => {
    const rates = new Set(transactions.map((t) => t.vatPercent));
    return Array.from(rates).sort((a, b) => b - a);
  }, [transactions]);

  // Filter and sort transactions
  const filteredTransactions = useMemo(() => {
    let result = [...transactions];

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (t) =>
          t.description.toLowerCase().includes(query) ||
          t.amount.toString().includes(query)
      );
    }

    // Type filter
    if (typeFilter !== 'all') {
      result = result.filter((t) => t.type === typeFilter);
    }

    // VAT filter
    if (vatFilter !== 'all') {
      result = result.filter((t) => t.vatPercent.toString() === vatFilter);
    }

    // Sort
    result.sort((a, b) => {
      let comparison = 0;
      if (sortField === 'date') {
        comparison = new Date(a.date).getTime() - new Date(b.date).getTime();
      } else if (sortField === 'amount') {
        comparison = a.amount - b.amount;
      } else if (sortField === 'vatPercent') {
        comparison = a.vatPercent - b.vatPercent;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [transactions, searchQuery, typeFilter, vatFilter, sortField, sortDirection]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const clearFilters = () => {
    setSearchQuery('');
    setVatFilter('all');
    setTypeFilter('all');
  };

  // Calculate summary stats
  const stats = useMemo(() => {
    const sales = transactions.filter(t => t.type === 'SALE' || !t.type);
    const purchases = transactions.filter(t => t.type === 'PURCHASE');
    
    const salesAmount = sales.reduce((sum, t) => sum + t.amount, 0);
    const purchasesAmount = purchases.reduce((sum, t) => sum + t.amount, 0);
    const outputVAT = sales.reduce((sum, t) => sum + (t.amount * t.vatPercent) / 100, 0);
    const inputVAT = purchases.reduce((sum, t) => sum + (t.amount * t.vatPercent) / 100, 0);
    
    return {
      salesCount: sales.length,
      purchasesCount: purchases.length,
      salesAmount,
      purchasesAmount,
      outputVAT,
      inputVAT,
    };
  }, [transactions]);

  // Find transaction for receipt preview
  const selectedTransaction = useMemo(() => {
    if (!selectedReceipt) return null;
    return transactions.find(t => t.receiptImage === selectedReceipt) || null;
  }, [selectedReceipt, transactions]);

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

  return (
    <div className="p-4 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {t('transactions')}
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            {t('manageTransactions')}
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
                <Plus className="h-5 w-5 text-[#7a76f0]" />
                {t('addTransaction')}
              </DialogTitle>
              <DialogDescription className="dark:text-gray-400">{t('recordNewTransaction')}</DialogDescription>
            </DialogHeader>
            <AddTransactionForm onSuccess={handleAddTransaction} />
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Card className="stat-card">
          <CardContent className="p-2.5 sm:p-4">
            <div className="flex items-center justify-between">
              <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-full stat-icon-green flex items-center justify-center">
                <ArrowUpCircle className="h-4 w-4 sm:h-5 sm:w-5 text-green-600 dark:text-green-400" />
              </div>
              <Badge className="badge-green text-[10px] sm:text-xs">{stats.salesCount}</Badge>
            </div>
            <p className="text-gray-500 dark:text-gray-400 text-[10px] sm:text-xs font-medium mt-1 sm:mt-2">{t('sales')} <span className="text-gray-400">({language === 'da' ? 'ekskl. moms' : 'excl. VAT'})</span></p>
            <p className="text-base sm:text-xl font-bold text-gray-900 dark:text-white">{tc(stats.salesAmount)}</p>
          </CardContent>
        </Card>

        <Card className="stat-card">
          <CardContent className="p-2.5 sm:p-4">
            <div className="flex items-center justify-between">
              <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-full stat-icon-amber flex items-center justify-center">
                <ArrowDownCircle className="h-4 w-4 sm:h-5 sm:w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <Badge className="badge-amber text-[10px] sm:text-xs">{stats.purchasesCount}</Badge>
            </div>
            <p className="text-gray-500 dark:text-gray-400 text-[10px] sm:text-xs font-medium mt-1 sm:mt-2">{t('purchases')} <span className="text-gray-400">({language === 'da' ? 'ekskl. moms' : 'excl. VAT'})</span></p>
            <p className="text-base sm:text-xl font-bold text-gray-900 dark:text-white">{tc(stats.purchasesAmount)}</p>
          </CardContent>
        </Card>

        <Card className="stat-card">
          <CardContent className="p-2.5 sm:p-4">
            <div className="flex items-center justify-between">
              <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-full stat-icon-primary flex items-center justify-center">
                <ArrowUpCircle className="h-4 w-4 sm:h-5 sm:w-5 text-[#554fe9] dark:text-[#7a76f0]" />
              </div>
            </div>
            <p className="text-gray-500 dark:text-gray-400 text-[10px] sm:text-xs font-medium mt-1 sm:mt-2">{t('outputVAT')}</p>
            <p className="text-base sm:text-xl font-bold text-gray-900 dark:text-white">{tc(stats.outputVAT)}</p>
          </CardContent>
        </Card>

        <Card className="stat-card">
          <CardContent className="p-2.5 sm:p-4">
            <div className="flex items-center justify-between">
              <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-full stat-icon-purple flex items-center justify-center">
                <ArrowDownCircle className="h-4 w-4 sm:h-5 sm:w-5 text-[#554fe9] dark:text-[#7a76f0]" />
              </div>
            </div>
            <p className="text-gray-500 dark:text-gray-400 text-[10px] sm:text-xs font-medium mt-1 sm:mt-2">{t('inputVAT')}</p>
            <p className="text-base sm:text-xl font-bold text-gray-900 dark:text-white">{tc(stats.inputVAT)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters Card */}
      <Card className="stat-card">
        <CardContent className="p-4">
          <div className="flex flex-col lg:flex-row gap-4">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder={t('searchDescription')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-gray-50 border-0"
              />
            </div>

            {/* Type Filter */}
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-gray-400" />
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-28 bg-gray-50 border-0">
                  <SelectValue placeholder={t('type')} />
                </SelectTrigger>
                <SelectContent className="bg-white">
                  <SelectItem value="all">{t('allTypes')}</SelectItem>
                  <SelectItem value="SALE">{t('sale')}</SelectItem>
                  <SelectItem value="PURCHASE">{t('purchase')}</SelectItem>
                  <SelectItem value="SALARY">{t('transactionTypeSalary')}</SelectItem>
                  <SelectItem value="BANK">{t('transactionTypeBank')}</SelectItem>
                  <SelectItem value="Z_REPORT">{t('transactionTypeZReport')}</SelectItem>
                  <SelectItem value="PRIVATE">{t('transactionTypePrivate')}</SelectItem>
                  <SelectItem value="ADJUSTMENT">{t('transactionTypeAdjustment')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* VAT Filter */}
            <div className="flex items-center gap-2">
              <Select value={vatFilter} onValueChange={setVatFilter}>
                <SelectTrigger className="w-28 bg-gray-50 border-0">
                  <SelectValue placeholder={t('vatPercent')} />
                </SelectTrigger>
                <SelectContent className="bg-white">
                  <SelectItem value="all">{t('allRates')}</SelectItem>
                  {vatRates.map((rate) => (
                    <SelectItem key={rate} value={rate.toString()}>
                      {rate}% VAT
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Clear Filters */}
            {(searchQuery || vatFilter !== 'all' || typeFilter !== 'all') && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400"
              >
                <X className="h-4 w-4 mr-1" />
                {t('clear')}
              </Button>
            )}
          </div>

          {/* Results count */}
          <div className="mt-3 text-sm text-gray-500 dark:text-gray-400">
            {t('showingOf')} {filteredTransactions.length} {t('of')} {transactions.length} {t('transactionsWord')}
          </div>
        </CardContent>
      </Card>

      {/* Transactions Table */}
      <Card className="stat-card border-0 shadow-lg dark:border dark:border-white/5">
        <CardContent className="p-0">
          {filteredTransactions.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              <Receipt className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>{t('noTransactionsFound')}</p>
              {(searchQuery || vatFilter !== 'all' || typeFilter !== 'all') && (
                <Button
                  variant="link"
                  onClick={clearFilters}
                  className="text-[#554fe9] mt-2"
                >
                  {t('clearFilters')}
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-gray-100">
                    <TableHead className="bg-gray-50 dark:bg-gray-700/50 w-20">
                      {t('type')}
                    </TableHead>
                    <TableHead className="bg-gray-50 dark:bg-gray-700/50">
                      <button
                        onClick={() => toggleSort('date')}
                        className="flex items-center gap-1 hover:text-[#554fe9] transition-colors"
                      >
                        {t('date')}
                        {sortField === 'date' &&
                          (sortDirection === 'asc' ? (
                            <ArrowUp className="h-4 w-4" />
                          ) : (
                            <ArrowDown className="h-4 w-4" />
                          ))}
                        {sortField !== 'date' && <ArrowUpDown className="h-4 w-4 opacity-50" />}
                      </button>
                    </TableHead>
                    <TableHead className="bg-gray-50 dark:bg-gray-700/50">
                      {t('description')}
                    </TableHead>
                    <TableHead className="text-right bg-gray-50 dark:bg-gray-700/50">
                      <button
                        onClick={() => toggleSort('amount')}
                        className="flex items-center gap-1 hover:text-[#554fe9] transition-colors ml-auto"
                      >
                        {t('amount')}
                        {sortField === 'amount' &&
                          (sortDirection === 'asc' ? (
                            <ArrowUp className="h-4 w-4" />
                          ) : (
                            <ArrowDown className="h-4 w-4" />
                          ))}
                        {sortField !== 'amount' && <ArrowUpDown className="h-4 w-4 opacity-50" />}
                      </button>
                    </TableHead>
                    <TableHead className="text-right bg-gray-50 dark:bg-gray-700/50">
                      <button
                        onClick={() => toggleSort('vatPercent')}
                        className="flex items-center gap-1 hover:text-[#554fe9] transition-colors ml-auto"
                      >
                        {t('vatPercent')}
                        {sortField === 'vatPercent' &&
                          (sortDirection === 'asc' ? (
                            <ArrowUp className="h-4 w-4" />
                          ) : (
                            <ArrowDown className="h-4 w-4" />
                          ))}
                        {sortField !== 'vatPercent' && <ArrowUpDown className="h-4 w-4 opacity-50" />}
                      </button>
                    </TableHead>
                    <TableHead className="text-right bg-gray-50 dark:bg-gray-700/50">
                      {t('vatAmount')}
                    </TableHead>
                    <TableHead className="text-center bg-gray-50 dark:bg-gray-700/50">
                      {t('actions')}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTransactions.map((transaction) => (
                    <TableRow
                      key={transaction.id}
                      className="border-b border-gray-50/50 hover:bg-gray-50 dark:hover:bg-gray-700/30"
                    >
                      <TableCell>
                        {transaction.type === 'PURCHASE' ? (
                          <Badge className="bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400 gap-1">
                            <ArrowDownCircle className="h-3 w-3" />
                            {language === 'da' ? 'Køb' : 'Buy'}
                          </Badge>
                        ) : (
                          <Badge className="bg-[#554fe9]/10 text-[#554fe9] dark:bg-[#554fe9]/20 dark:text-[#7a76f0] gap-1">
                            <ArrowUpCircle className="h-3 w-3" />
                            {language === 'da' ? 'Salg' : 'Sale'}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="font-medium whitespace-nowrap">
                        {td(new Date(transaction.date))}
                      </TableCell>
                      <TableCell className="max-w-[150px] lg:max-w-[250px] truncate">
                        {transaction.description}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap font-medium">
                        {tc(transaction.amount)}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                          {transaction.vatPercent}%
                        </span>
                      </TableCell>
                      <TableCell className={`text-right whitespace-nowrap font-medium ${
                        transaction.type === 'PURCHASE' 
                          ? 'text-amber-600 dark:text-amber-400' 
                          : 'text-[#554fe9] dark:text-[#7a76f0]'
                      }`}>
                        {tc((transaction.amount * transaction.vatPercent) / 100)}
                      </TableCell>
                      <TableCell className="text-center">
                        {transaction.id.startsWith('inv-') ? (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-[#554fe9]/10 text-[#554fe9] dark:bg-[#554fe9]/20 dark:text-[#7a76f0] border-[#554fe9]/20 gap-1">
                                  <FileText className="h-3 w-3" />
                                  {language === 'da' ? 'Faktura' : 'Invoice'}
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>{language === 'da' ? 'Genereret fra faktura' : 'Generated from invoice'}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : (
                          <div className="flex items-center justify-center gap-0.5">
                            {transaction.receiptImage ? (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => setSelectedReceipt(transaction.receiptImage)}
                                      className="text-[#554fe9] hover:text-[#554fe9]"
                                    >
                                      <Eye className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>{t('receiptPreview')}</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            ) : (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => openUploadDialog(transaction.id)}
                                      className="text-gray-300 hover:text-[#554fe9] dark:text-gray-600 dark:hover:text-[#7a76f0]"
                                    >
                                      <Paperclip className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>{t('attachReceipt')}</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}

                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleExportPeppol(transaction.id)}
                                    disabled={exportingId === transaction.id}
                                    className="text-gray-400 hover:text-[#554fe9]"
                                  >
                                    <FileText className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Export OIOUBL</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>

                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-gray-400 hover:text-red-500"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent className="bg-white">
                                <AlertDialogHeader>
                                  <AlertDialogTitle className="dark:text-white">{t('deleteTransaction')}</AlertDialogTitle>
                                  <AlertDialogDescription className="dark:text-gray-400">
                                    {t('deleteConfirmMessage')}
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel className="dark:bg-white/5">{t('cancel')}</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleDeleteTransaction(transaction.id)}
                                    className="bg-red-500 hover:bg-red-600"
                                  >
                                    {t('delete')}
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Receipt Preview Dialog */}
      <Dialog open={!!selectedReceipt} onOpenChange={(open) => { if (!open) setSelectedReceipt(null); }}>
        <DialogContent className="max-w-2xl bg-white">
          <DialogHeader>
            <DialogTitle className="dark:text-white flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              {t('receiptPreview')}
            </DialogTitle>
            {selectedTransaction && (
              <DialogDescription className="dark:text-gray-400">
                {selectedTransaction.description} — {td(new Date(selectedTransaction.date))} — {tc(selectedTransaction.amount)}
              </DialogDescription>
            )}
          </DialogHeader>
          {selectedReceipt && (
            <div className="relative">
              <img
                src={getReceiptUrl(selectedReceipt) || ''}
                alt="Receipt"
                className="w-full h-auto rounded-lg border"
              />
            </div>
          )}
          {selectedTransaction && (
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => openUploadDialog(selectedTransaction.id)}
                className="gap-2 dark:text-gray-300"
              >
                <Upload className="h-4 w-4" />
                {language === 'da' ? 'Skift kvittering' : 'Replace receipt'}
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 text-red-500 hover:text-red-600 border-red-200 hover:bg-red-50 dark:border-red-500/30 dark:hover:bg-red-500/10"
                  >
                    <X className="h-4 w-4" />
                    {t('removeReceipt')}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="bg-white">
                  <AlertDialogHeader>
                    <AlertDialogTitle className="dark:text-white">{t('removeReceipt')}</AlertDialogTitle>
                    <AlertDialogDescription className="dark:text-gray-400">
                      {t('removeReceiptConfirm')}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="dark:bg-white/5">{t('cancel')}</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => handleRemoveReceipt(selectedTransaction!.id)}
                      className="bg-red-500 hover:bg-red-600"
                    >
                      {t('removeReceipt')}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Upload Receipt to Existing Transaction Dialog */}
      <Dialog open={!!uploadDialogTransactionId} onOpenChange={(open) => { if (!open) closeUploadDialog(); }}>
        <DialogContent className="max-w-md bg-white">
          <DialogHeader>
            <DialogTitle className="dark:text-white flex items-center gap-2">
              <Paperclip className="h-5 w-5" />
              {t('attachReceipt')}
            </DialogTitle>
            <DialogDescription className="dark:text-gray-400">
              {t('attachReceiptDesc')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {uploadError && (
              <div className="p-3 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 rounded-md flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {uploadError}
              </div>
            )}

            {/* Hidden file input */}
            <input
              ref={uploadInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleUploadFileChange}
              className="hidden"
              disabled={isUploading}
            />

            {/* Upload area */}
            {uploadPreview ? (
              <div className="relative">
                <img
                  src={uploadPreview}
                  alt="Receipt preview"
                  className="w-full h-48 object-cover rounded-lg border"
                />
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="absolute top-2 right-2"
                  onClick={() => {
                    setUploadFile(null);
                    setUploadPreview(null);
                    if (uploadInputRef.current) uploadInputRef.current.value = '';
                  }}
                  disabled={isUploading}
                >
                  <X className="h-4 w-4" />
                </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              className="w-full h-28 border-dashed border-2 hover:border-[#554fe9] hover:bg-[#554fe9]/5 transition-colors dark:border-white/20 dark:hover:border-[#554fe9]"
              onClick={() => uploadInputRef.current?.click()}
              disabled={isUploading}
            >
              <div className="flex flex-col items-center gap-2">
                <div className="relative">
                  <Camera className="h-7 w-7 text-gray-400 dark:text-gray-500" />
                </div>
                <div className="text-center">
                  <span className="text-sm text-gray-600 dark:text-gray-400 font-medium">
                    {t('takePictureOfReceipt')}
                  </span>
                </div>
              </div>
            </Button>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1 dark:text-gray-300"
                onClick={closeUploadDialog}
                disabled={isUploading}
              >
                {t('cancel')}
              </Button>
              <Button
                type="button"
                className="flex-1 btn-gradient text-white"
                onClick={handleUploadReceipt}
                disabled={!uploadFile || isUploading}
              >
                {isUploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('processing')}
                  </>
                ) : (
                  <>
                    <Paperclip className="mr-2 h-4 w-4" />
                    {t('attachReceipt')}
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
