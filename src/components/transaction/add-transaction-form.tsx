'use client';

import { useState, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Upload,
  X,
  Loader2,
  Image as ImageIcon,
  Camera,
  AlertCircle,
  ArrowUpCircle,
  ArrowDownCircle,
  Info,
  Wallet,
  Landmark,
  FileBarChart,
  User,
  SlidersHorizontal,
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTranslation } from '@/lib/use-translation';

type TransactionType = 'SALE' | 'PURCHASE' | 'SALARY' | 'BANK' | 'Z_REPORT' | 'PRIVATE' | 'ADJUSTMENT';

const CURRENCIES = ['DKK', 'EUR', 'USD', 'GBP', 'SEK', 'NOK'] as const;

interface AddTransactionFormProps {
  onSuccess: () => void;
}

export function AddTransactionForm({ onSuccess }: AddTransactionFormProps) {
  const { t, tc, language } = useTranslation();
  
  const formatDate = (date: Date): string => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const [type, setType] = useState<TransactionType>('SALE');
  const [date, setDate] = useState(formatDate(new Date()));
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('DKK');
  const [exchangeRate, setExchangeRate] = useState('');
  const [includesVAT, setIncludesVAT] = useState(false);
  const [description, setDescription] = useState('');
  const [vatPercent, setVatPercent] = useState('25');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Calculate net amount and VAT from the entered amount
  const parsedAmount = parseFloat(amount || '0');
  const parsedVatPercent = parseFloat(vatPercent || '0');

  const netAmount = includesVAT
    ? parsedAmount / (1 + parsedVatPercent / 100)
    : parsedAmount;
  const vatAmount = netAmount * parsedVatPercent / 100;
  const totalAmount = netAmount + vatAmount;

  // Transaction type definitions
  const transactionTypes: { value: TransactionType; label: string; icon: React.ReactNode; description: string }[] = [
    { value: 'SALE', label: t('sale'), icon: <ArrowUpCircle className="h-5 w-5" />, description: t('saleDescription') },
    { value: 'PURCHASE', label: t('purchase'), icon: <ArrowDownCircle className="h-5 w-5" />, description: t('purchaseDescription') },
    { value: 'SALARY', label: t('transactionTypeSalary'), icon: <Wallet className="h-5 w-5" />, description: '' },
    { value: 'BANK', label: t('transactionTypeBank'), icon: <Landmark className="h-5 w-5" />, description: '' },
    { value: 'Z_REPORT', label: t('transactionTypeZReport'), icon: <FileBarChart className="h-5 w-5" />, description: '' },
    { value: 'PRIVATE', label: t('transactionTypePrivate'), icon: <User className="h-5 w-5" />, description: '' },
    { value: 'ADJUSTMENT', label: t('transactionTypeAdjustment'), icon: <SlidersHorizontal className="h-5 w-5" />, description: '' },
  ];

  // When switching type, auto-set includesVAT default
  const handleTypeChange = useCallback((newType: TransactionType) => {
    setType(newType);
    setIncludesVAT(newType === 'PURCHASE');
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      // Validate file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        setError(language === 'da' ? 'Filstørrelsen skal være under 10MB' : 'File size must be less than 10MB');
        return;
      }

      setReceiptFile(file);
      setError('');

      // Create preview
      const reader = new FileReader();
      reader.onload = (event) => {
        setReceiptPreview(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    },
    [language]
  );

  const clearReceipt = useCallback(() => {
    setReceiptFile(null);
    setReceiptPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError('');
      setIsLoading(true);

      try {
        let receiptImagePath: string | null = null;

        // Upload receipt if exists
        if (receiptFile) {
          const formData = new FormData();
          formData.append('file', receiptFile);

          const uploadResponse = await fetch('/api/transactions/upload', {
            method: 'POST',
            body: formData,
          });

          if (!uploadResponse.ok) {
            throw new Error(language === 'da' ? 'Kunne ikke uploade kvittering' : 'Failed to upload receipt');
          }

          const uploadData = await uploadResponse.json();
          receiptImagePath = uploadData.path;
        }

        // When includesVAT is true, we store the NET amount (excl. VAT)
        const amountToStore = includesVAT ? netAmount : parsedAmount;

        // Create transaction
        const response = await fetch('/api/transactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type,
            date,
            amount: amountToStore,
            currency: currency !== 'DKK' ? currency : undefined,
            exchangeRate: currency !== 'DKK' && exchangeRate ? parseFloat(exchangeRate) : undefined,
            description,
            vatPercent: parseFloat(vatPercent),
            receiptImage: receiptImagePath,
          }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || (language === 'da' ? 'Kunne ikke oprette transaktion' : 'Failed to create transaction'));
        }

        // Reset form
        setType('SALE');
        setDate(formatDate(new Date()));
        setAmount('');
        setCurrency('DKK');
        setExchangeRate('');
        setIncludesVAT(false);
        setDescription('');
        setVatPercent('25');
        clearReceipt();

        onSuccess();
      } catch (err) {
        setError(err instanceof Error ? err.message : (language === 'da' ? 'Der opstod en fejl' : 'An error occurred'));
      } finally {
        setIsLoading(false);
      }
    },
    [type, date, amount, currency, exchangeRate, includesVAT, netAmount, parsedAmount, description, vatPercent, receiptFile, clearReceipt, onSuccess, language]
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="p-3 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 rounded-md flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Transaction Type Selector */}
      <div className="space-y-2">
        <Label className="dark:text-gray-300">{t('transactionType')}</Label>
        <div className="grid grid-cols-2 gap-2">
          {transactionTypes.map((txType) => (
            <Button
              key={txType.value}
              type="button"
              variant={type === txType.value ? 'default' : 'outline'}
              className={`h-auto py-3 flex flex-col items-center gap-1 ${
                type === txType.value 
                  ? 'btn-primary text-white' 
                  : 'dark:border-white/20'
              }`}
              onClick={() => handleTypeChange(txType.value)}
            >
              {txType.icon}
              <span className="font-medium text-sm">{txType.label}</span>
            </Button>
          ))}
        </div>
        {transactionTypes.find(tt => tt.value === type)?.description && (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {transactionTypes.find(tt => tt.value === type)!.description}
          </p>
        )}
      </div>

      {/* Receipt Upload Section */}
      <div className="space-y-2">
        <Label className="dark:text-gray-300">{t('receipt')} ({language === 'da' ? 'Valgfrit' : 'Optional'})</Label>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileChange}
          className="hidden"
          disabled={isLoading}
        />

        {receiptPreview ? (
          <div className="relative">
            <img
              src={receiptPreview}
              alt="Receipt preview"
              className="w-full h-40 object-cover rounded-lg border"
            />
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="absolute top-2 right-2"
              onClick={clearReceipt}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            className="w-full h-28 border-dashed border-2 hover:border-[#554fe9] hover:bg-[#554fe9]/5 transition-colors dark:border-white/20 dark:hover:border-[#554fe9]"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading}
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
      </div>

      <div className="space-y-2">
        <Label htmlFor="date" className="dark:text-gray-300">{t('date')}</Label>
        <Input
          id="date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
          disabled={isLoading}
          className="dark:bg-white/5"
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="amount" className="dark:text-gray-300">
            {t('amount')} (DKK) {includesVAT ? `(${language === 'da' ? 'inkl.' : 'incl.'} moms)` : `(${language === 'da' ? 'ekskl.' : 'excl.'} moms)`}
          </Label>
          <div className="flex items-center gap-2">
            <Label htmlFor="includesVAT" className="text-xs text-gray-500 dark:text-gray-400 cursor-pointer">
              {t('amountIncludesVAT')}
            </Label>
            <Switch
              id="includesVAT"
              checked={includesVAT}
              onCheckedChange={setIncludesVAT}
              disabled={isLoading}
            />
          </div>
        </div>
        <Input
          id="amount"
          type="number"
          step="0.01"
          placeholder="0.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
          disabled={isLoading}
          className="dark:bg-white/5"
        />
        {includesVAT && (
          <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
            <Info className="h-3 w-3 shrink-0" />
            {t('grossToNetInfo')}
          </p>
        )}
      </div>

      {/* Currency Selector */}
      <div className="space-y-2">
        <Label className="dark:text-gray-300">{t('currency')}</Label>
        <Select value={currency} onValueChange={(val) => { setCurrency(val); if (val === 'DKK') setExchangeRate(''); }}>
          <SelectTrigger className="dark:bg-white/5">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-white">
            {CURRENCIES.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Exchange Rate (visible only when non-DKK) */}
      {currency !== 'DKK' && (
        <>
          <div className="space-y-2">
            <Label htmlFor="exchangeRate" className="dark:text-gray-300">{t('exchangeRate')} ({currency} → DKK)</Label>
            <Input
              id="exchangeRate"
              type="number"
              step="0.0001"
              min="0"
              placeholder="0.0000"
              value={exchangeRate}
              onChange={(e) => setExchangeRate(e.target.value)}
              disabled={isLoading}
              className="dark:bg-white/5"
            />
          </div>
          <p className="text-xs text-[#7dabb5] dark:text-[#80c0cc] flex items-center gap-1">
            <Info className="h-3 w-3 shrink-0" />
            {t('currencyInfo')}
          </p>
        </>
      )}

      <div className="space-y-2">
        <Label htmlFor="vatPercent" className="dark:text-gray-300">{language === 'da' ? 'Moms procent' : 'VAT Percentage'}</Label>
        <Input
          id="vatPercent"
          type="number"
          step="0.1"
          min="0"
          max="100"
          value={vatPercent}
          onChange={(e) => setVatPercent(e.target.value)}
          disabled={isLoading}
          className="dark:bg-white/5"
        />
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {language === 'da' ? 'Standard dansk momssats er 25%' : 'Standard Danish VAT rate is 25%'}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description" className="dark:text-gray-300">{t('description')}</Label>
        <Textarea
          id="description"
          placeholder={language === 'da' ? 'Hvad var denne transaktion for?' : 'What was this transaction for?'}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
          disabled={isLoading}
          rows={3}
          className="dark:bg-white/5"
        />
      </div>

      {amount && parsedAmount > 0 && (
        <div className="p-3 bg-gray-50 rounded-lg border space-y-2">
          <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
            <ImageIcon className="h-4 w-4" />
            <span className="text-sm font-medium">{language === 'da' ? 'Moms beregning' : 'VAT Calculation'}</span>
          </div>
          
          {includesVAT ? (
            <div className="space-y-1 text-sm">
              <div className="flex justify-between text-gray-600 dark:text-gray-400">
                <span>{t('netAmount')}:</span>
                <span>{tc(netAmount)}</span>
              </div>
              <div className="flex justify-between text-gray-600 dark:text-gray-400">
                <span>{t('vatAmountCalc')} ({parsedVatPercent}%):</span>
                <span>{tc(vatAmount)}</span>
              </div>
              <div className="flex justify-between font-medium text-gray-900 dark:text-white pt-1 border-t border-gray-200">
                <span>{t('totalInclVAT')}:</span>
                <span>{tc(totalAmount)}</span>
              </div>
            </div>
          ) : (
            <div className="text-sm text-gray-600 dark:text-gray-400">
              {language === 'da' ? 'Moms beløb:' : 'VAT Amount:'}{' '}
              {tc(vatAmount)}
            </div>
          )}

          <div className="text-xs text-gray-500 dark:text-gray-400 pt-1">
            {type === 'SALE' 
              ? `(${language === 'da' ? 'Udgående moms' : 'Output VAT'})` 
              : `(${language === 'da' ? 'Indgående moms - fradragsberettiget' : 'Input VAT - deductible'})`}
          </div>
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <Button
          type="submit"
          className="flex-1 btn-gradient text-white"
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t('processing')}
            </>
          ) : (
            t('save')
          )}
        </Button>
      </div>
    </form>
  );
}
