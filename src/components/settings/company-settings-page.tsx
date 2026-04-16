'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { User } from '@/lib/auth-store';
import { useTranslation } from '@/lib/use-translation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import {
  Settings,
  Building2,
  Landmark,
  FileText,
  Image as ImageIcon,
  Upload,
  X,
  Check,
  Loader2,
  Info,
  AlertCircle,
  Save,
  RefreshCw,
  Camera,
  ArrowLeft,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';

// ── Types ──────────────────────────────────────────────────────────────

interface CompanyInfo {
  id: string;
  logo: string | null;
  companyName: string;
  address: string;
  phone: string;
  email: string;
  cvrNumber: string;
  invoicePrefix: string;
  bankName: string;
  bankAccount: string;
  bankRegistration: string;
  bankIban: string | null;
  bankStreet: string | null;
  bankCity: string | null;
  bankCountry: string | null;
  invoiceTerms: string | null;
  nextInvoiceSequence: number;
  currentYear: number;
  createdAt: string;
  updatedAt: string;
}

interface CompanySettingsPageProps {
  user: User;
  onNavigate?: (view: string) => void;
}

// ── Component ──────────────────────────────────────────────────────────

export function CompanySettingsPage({ user, onNavigate }: CompanySettingsPageProps) {
  const { t, language } = useTranslation();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── State ──
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Form state
  const [form, setForm] = useState({
    logo: '' as string,
    companyName: '',
    address: '',
    phone: '',
    email: '',
    cvrNumber: '',
    invoicePrefix: '',
    bankName: '',
    bankAccount: '',
    bankRegistration: '',
    bankIban: '',
    bankStreet: '',
    bankCity: '',
    bankCountry: '',
    invoiceTerms: '',
  });

  // ── Fetch company info ──
  const fetchCompanyInfo = useCallback(async () => {
    try {
      const response = await fetch('/api/company');
      if (response.ok) {
        const data = await response.json();
        if (data.companyInfo) {
          const info = data.companyInfo;
          setCompanyInfo(info);
          setForm({
            logo: info.logo || '',
            companyName: info.companyName || '',
            address: info.address || '',
            phone: info.phone || '',
            email: info.email || '',
            cvrNumber: info.cvrNumber || '',
            invoicePrefix: info.invoicePrefix || '',
            bankName: info.bankName || '',
            bankAccount: info.bankAccount || '',
            bankRegistration: info.bankRegistration || '',
            bankIban: info.bankIban || '',
            bankStreet: info.bankStreet || '',
            bankCity: info.bankCity || '',
            bankCountry: info.bankCountry || '',
            invoiceTerms: info.invoiceTerms || '',
          });
        }
      }
    } catch (error) {
      console.error('Failed to fetch company info:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCompanyInfo();
  }, [fetchCompanyInfo]);

  // ── Track changes ──
  useEffect(() => {
    if (companyInfo) {
      // Editing existing company info — track diffs
      const changed =
        form.companyName !== (companyInfo.companyName || '') ||
        form.address !== (companyInfo.address || '') ||
        form.phone !== (companyInfo.phone || '') ||
        form.email !== (companyInfo.email || '') ||
        form.cvrNumber !== (companyInfo.cvrNumber || '') ||
        form.invoicePrefix !== (companyInfo.invoicePrefix || '') ||
        form.bankName !== (companyInfo.bankName || '') ||
        form.bankAccount !== (companyInfo.bankAccount || '') ||
        form.bankRegistration !== (companyInfo.bankRegistration || '') ||
        form.bankIban !== (companyInfo.bankIban || '') ||
        form.bankStreet !== (companyInfo.bankStreet || '') ||
        form.bankCity !== (companyInfo.bankCity || '') ||
        form.bankCountry !== (companyInfo.bankCountry || '') ||
        form.invoiceTerms !== (companyInfo.invoiceTerms || '') ||
        form.logo !== (companyInfo.logo || '');
      setHasChanges(changed);
    } else {
      // New user (no company info yet) — treat any filled required field as a change
      const hasAny =
        form.companyName.trim() !== '' ||
        form.address.trim() !== '' ||
        form.phone.trim() !== '' ||
        form.email.trim() !== '' ||
        form.cvrNumber.trim() !== '' ||
        form.invoicePrefix.trim() !== '' ||
        form.bankName.trim() !== '' ||
        form.bankAccount.trim() !== '' ||
        form.bankRegistration.trim() !== '';
      setHasChanges(hasAny);
    }
  }, [form, companyInfo]);

  // ── Update form field ──
  const updateField = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  // ── Logo upload ──
  const handleLogoUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (!file.type.match(/^image\/(jpeg|png)$/)) {
        toast({
          title: language === 'da' ? 'Ugyldigt format' : 'Invalid format',
          description: language === 'da' ? 'Kun JPG og PNG filer er tilladt' : 'Only JPG and PNG files are allowed',
          variant: 'destructive',
        });
        return;
      }

      if (file.size > 2 * 1024 * 1024) {
        toast({
          title: language === 'da' ? 'Filen er for stor' : 'File too large',
          description: language === 'da' ? 'Filen må højst være 2MB' : 'File size must be under 2MB',
          variant: 'destructive',
        });
        return;
      }

      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        updateField('logo', base64);
      };
      reader.readAsDataURL(file);
    },
    [toast, language]
  );

  // ── Remove logo ──
  const handleRemoveLogo = useCallback(() => {
    updateField('logo', '');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  // ── Save ──
  const handleSave = useCallback(async () => {
    // Validate required fields
    const requiredFields = [
      'companyName',
      'address',
      'phone',
      'email',
      'cvrNumber',
      'invoicePrefix',
      'bankName',
      'bankAccount',
      'bankRegistration',
    ] as const;

    for (const field of requiredFields) {
      if (!form[field].trim()) {
        toast({
          title: language === 'da' ? 'Mangler påkrævede felter' : 'Missing Required Fields',
          description: language === 'da' ? 'Udfyld alle felter markeret med *' : 'Fill in all fields marked with *',
          variant: 'destructive',
        });
        return;
      }
    }

    setIsSaving(true);
    try {
      const method = companyInfo ? 'PUT' : 'POST';
      const response = await fetch('/api/company', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          logo: form.logo || null,
          companyName: form.companyName.trim(),
          address: form.address.trim(),
          phone: form.phone.trim(),
          email: form.email.trim(),
          cvrNumber: form.cvrNumber.trim(),
          invoicePrefix: form.invoicePrefix.trim().toUpperCase(),
          bankName: form.bankName.trim(),
          bankAccount: form.bankAccount.trim(),
          bankRegistration: form.bankRegistration.trim(),
          bankIban: form.bankIban.trim() || null,
          bankStreet: form.bankStreet.trim() || null,
          bankCity: form.bankCity.trim() || null,
          bankCountry: form.bankCountry.trim() || null,
          invoiceTerms: form.invoiceTerms.trim() || null,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.companyInfo) {
          setCompanyInfo(data.companyInfo);
          setHasChanges(false);
        }
        toast({
          title: language === 'da' ? 'Indstillinger gemt!' : 'Settings Saved!',
          description: language === 'da' ? 'Virksomhedsoplysningerne er opdateret.' : 'Company information has been updated.',
        });
      } else {
        const errorData = await response.json().catch(() => ({}));
        toast({
          title: language === 'da' ? 'Fejl ved gemning' : 'Save Error',
          description: errorData.error || (language === 'da' ? 'Kunne ikke gemme indstillingerne.' : 'Could not save settings.'),
          variant: 'destructive',
        });
      }
    } catch {
      toast({
        title: language === 'da' ? 'Fejl ved gemning' : 'Save Error',
        description: language === 'da' ? 'Kunne ikke gemme indstillingerne.' : 'Could not save settings.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  }, [form, companyInfo, toast, language]);

  // ── Loading skeleton ──
  if (isLoading) {
    return (
      <div className="p-4 lg:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-96" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="stat-card">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="flex-1 space-y-1">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-5 w-16" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {Array.from({ length: 2 }).map((_, i) => (
            <Card key={i} className="stat-card">
              <CardHeader className="pb-3">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-4 w-72" />
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {Array.from({ length: 4 }).map((_, j) => (
                    <div key={j} className="space-y-2">
                      <Skeleton className="h-4 w-28" />
                      <Skeleton className="h-10 w-full" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8 space-y-6">
      {/* ── Header Section ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {onNavigate && (
            <Button
              variant="ghost"
              size="sm"
              className="gap-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              onClick={() => onNavigate('dashboard')}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Settings className="h-6 w-6 text-[#6a66f0]" />
              {language === 'da' ? 'Indstillinger' : 'Settings'}
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              {language === 'da'
                ? 'Administrer virksomhedsoplysninger, bankoplysninger og fakturaindstillinger'
                : 'Manage company information, bank details, and invoice settings'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {hasChanges && (
            <Badge className="badge-amber text-xs gap-1">
              <AlertCircle className="h-3 w-3" />
              {language === 'da' ? 'Ikke gemt' : 'Unsaved'}
            </Badge>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              fetchCompanyInfo();
            }}
            className="gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            <span className="hidden sm:inline">
              {language === 'da' ? 'Opdater' : 'Refresh'}
            </span>
          </Button>
          <Button
            onClick={handleSave}
            disabled={!hasChanges || isSaving}
            className="bg-[#6a66f0] hover:bg-[#554fe9] text-white font-medium gap-2 shadow-lg shadow-[#6a66f0]/25 transition-all disabled:opacity-50"
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {isSaving
              ? (language === 'da' ? 'Gemmer...' : 'Saving...')
              : (language === 'da' ? 'Gem ændringer' : 'Save Changes')}
          </Button>
        </div>
      </div>

      {/* ── Status Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        {/* Company Info Status */}
        <Card className="stat-card">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full stat-icon-primary flex items-center justify-center shrink-0">
                <Building2 className="h-5 w-5 text-[#6a66f0] dark:text-[#9b96f5]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {t('companyInformation')}
                </p>
                <p className={`text-sm font-bold mt-0.5 ${
                  companyInfo
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-amber-600 dark:text-amber-400'
                }`}>
                  {companyInfo
                    ? (language === 'da' ? 'Komplet' : 'Complete')
                    : (language === 'da' ? 'Mangler' : 'Incomplete')}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Bank Details Status */}
        <Card className="stat-card">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full stat-icon-green flex items-center justify-center shrink-0">
                <Landmark className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {language === 'da' ? 'Bankoplysninger' : 'Bank Details'}
                </p>
                <p className={`text-sm font-bold mt-0.5 ${
                  form.bankName && form.bankAccount
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-amber-600 dark:text-amber-400'
                }`}>
                  {form.bankName && form.bankAccount
                    ? (language === 'da' ? 'Udfyldt' : 'Filled')
                    : (language === 'da' ? 'Mangler' : 'Missing')}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Last Updated */}
        <Card className="stat-card">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full stat-icon-amber flex items-center justify-center shrink-0">
                <FileText className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {language === 'da' ? 'Sidst opdateret' : 'Last Updated'}
                </p>
                {companyInfo?.updatedAt ? (
                  <p className="text-sm font-bold text-gray-900 dark:text-white mt-0.5">
                    {formatDistanceToNow(new Date(companyInfo.updatedAt), { addSuffix: true })}
                  </p>
                ) : (
                  <p className="text-sm font-bold text-gray-400 dark:text-gray-500 mt-0.5">
                    —
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Main Content Grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── Company Details Card ── */}
        <Card className="stat-card border-0 shadow-lg dark:border dark:border-white/5">
          <CardHeader className="pb-4">
            <CardTitle className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-[#6a66f0] to-[#554fe9] flex items-center justify-center shrink-0">
                <Building2 className="h-4 w-4 text-white" />
              </div>
              {language === 'da' ? 'Virksomhedsoplysninger' : 'Company Details'}
            </CardTitle>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {language === 'da'
                ? 'Grundlæggende oplysninger om din virksomhed'
                : 'Basic information about your business'}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Company Name */}
            <div className="space-y-2">
              <Label htmlFor="companyName" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('companyName')} <span className="text-red-500">*</span>
              </Label>
              <Input
                id="companyName"
                value={form.companyName}
                onChange={(e) => updateField('companyName', e.target.value)}
                placeholder={language === 'da' ? 'f.eks. AlphaAi ApS' : 'e.g. AlphaAi ApS'}
                className="h-10"
              />
            </div>

            {/* Address */}
            <div className="space-y-2">
              <Label htmlFor="address" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('companyAddress')} <span className="text-red-500">*</span>
              </Label>
              <Input
                id="address"
                value={form.address}
                onChange={(e) => updateField('address', e.target.value)}
                placeholder={language === 'da' ? 'f.eks. Strøget 1, 1234 København' : 'e.g. Strøget 1, 1234 Copenhagen'}
                className="h-10"
              />
            </div>

            {/* Phone & Email row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="phone" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('companyPhone')} <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="phone"
                  value={form.phone}
                  onChange={(e) => updateField('phone', e.target.value)}
                  placeholder="+45 12 34 56 78"
                  className="h-10"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('companyEmail')} <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => updateField('email', e.target.value)}
                  placeholder="info@alphaai.dk"
                  className="h-10"
                />
              </div>
            </div>

            {/* CVR */}
            <div className="space-y-2">
              <Label htmlFor="cvrNumber" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('cvrNumber')} <span className="text-red-500">*</span>
              </Label>
              <Input
                id="cvrNumber"
                value={form.cvrNumber}
                onChange={(e) => updateField('cvrNumber', e.target.value)}
                placeholder={language === 'da' ? 'f.eks. 12345678' : 'e.g. 12345678'}
                className="h-10"
              />
            </div>

            {/* Info note */}
            <div className="flex items-start gap-2 text-xs text-gray-500 dark:text-gray-400 info-box-primary rounded-lg p-3">
              <Info className="h-4 w-4 shrink-0 mt-0.5 text-[#6a66f0] dark:text-[#9b96f5]" />
              <p>
                {language === 'da'
                  ? 'Disse oplysninger vises automatisk på alle dine fakturaer og eksporterede dokumenter.'
                  : 'This information is automatically displayed on all your invoices and exported documents.'}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* ── Bank Details Card ── */}
        <Card className="stat-card border-0 shadow-lg dark:border dark:border-white/5">
          <CardHeader className="pb-4">
            <CardTitle className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center shrink-0">
                <Landmark className="h-4 w-4 text-white" />
              </div>
              {language === 'da' ? 'Bankoplysninger' : 'Bank Details'}
            </CardTitle>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {language === 'da'
                ? 'Dine bankoplysninger til fakturabetaling'
                : 'Your bank details for invoice payments'}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Bank Name */}
            <div className="space-y-2">
              <Label htmlFor="bankName" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('bankName')} <span className="text-red-500">*</span>
              </Label>
              <Input
                id="bankName"
                value={form.bankName}
                onChange={(e) => updateField('bankName', e.target.value)}
                placeholder={language === 'da' ? 'f.eks. Nordea' : 'e.g. Nordea'}
                className="h-10"
              />
            </div>

            {/* Reg & Account row */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="bankRegistration" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('bankRegistration')} <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="bankRegistration"
                  value={form.bankRegistration}
                  onChange={(e) => updateField('bankRegistration', e.target.value)}
                  placeholder="1234"
                  className="h-10"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bankAccount" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('bankAccount')} <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="bankAccount"
                  value={form.bankAccount}
                  onChange={(e) => updateField('bankAccount', e.target.value)}
                  placeholder="1234567890"
                  className="h-10"
                />
              </div>
            </div>

            {/* IBAN */}
            <div className="space-y-2">
              <Label htmlFor="bankIban" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('bankIban')}
              </Label>
              <Input
                id="bankIban"
                value={form.bankIban}
                onChange={(e) => updateField('bankIban', e.target.value)}
                placeholder="DK50 1234 1234 1234 12"
                className="h-10"
              />
            </div>

            <Separator className="my-2" />

            {/* Bank Address */}
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              {language === 'da' ? 'Bankadresse (frivillig)' : 'Bank Address (Optional)'}
            </p>

            <div className="space-y-2">
              <Label htmlFor="bankStreet" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('bankStreet')}
              </Label>
              <Input
                id="bankStreet"
                value={form.bankStreet}
                onChange={(e) => updateField('bankStreet', e.target.value)}
                placeholder={language === 'da' ? 'f.eks. Holmens Kanal 2' : 'e.g. Holmens Kanal 2'}
                className="h-10"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="bankCity" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('bankCity')}
                </Label>
                <Input
                  id="bankCity"
                  value={form.bankCity}
                  onChange={(e) => updateField('bankCity', e.target.value)}
                  placeholder={language === 'da' ? 'f.eks. 1060 København K' : 'e.g. 1060 Copenhagen K'}
                  className="h-10"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bankCountry" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('bankCountry')}
                </Label>
                <Input
                  id="bankCountry"
                  value={form.bankCountry}
                  onChange={(e) => updateField('bankCountry', e.target.value)}
                  placeholder={language === 'da' ? 'Danmark' : 'Denmark'}
                  className="h-10"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Bottom Row: Logo + Invoice Settings ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── Logo Card ── */}
        <Card className="stat-card border-0 shadow-lg dark:border dark:border-white/5">
          <CardHeader className="pb-4">
            <CardTitle className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shrink-0">
                <ImageIcon className="h-4 w-4 text-white" aria-hidden="true" />
              </div>
              {language === 'da' ? 'Virksomhedslogo' : 'Company Logo'}
            </CardTitle>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {language === 'da'
                ? 'Upload et logo til dine fakturaer'
                : 'Upload a logo for your invoices'}
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Logo preview / upload area */}
              {form.logo ? (
                <div className="relative group rounded-xl border-2 border-dashed border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 p-4 transition-colors hover:border-[#6a66f0]/40 dark:hover:border-[#9b96f5]/40">
                  <div className="flex items-center justify-center">
                    <img
                      src={form.logo}
                      alt="Company Logo"
                      className="max-h-32 max-w-full object-contain rounded-lg"
                    />
                  </div>
                  <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="secondary"
                            size="sm"
                            className="h-8 w-8 p-0 rounded-full bg-white dark:bg-[#1c2035] shadow-sm"
                            onClick={() => fileInputRef.current?.click()}
                          >
                            <Camera className="h-3.5 w-3.5 text-gray-600 dark:text-gray-300" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{language === 'da' ? 'Skift logo' : 'Change Logo'}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="secondary"
                            size="sm"
                            className="h-8 w-8 p-0 rounded-full bg-white dark:bg-[#1c2035] shadow-sm hover:bg-red-50 dark:hover:bg-red-900/20"
                            onClick={handleRemoveLogo}
                          >
                            <X className="h-3.5 w-3.5 text-red-500" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{language === 'da' ? 'Fjern logo' : 'Remove Logo'}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>
              ) : (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="cursor-pointer rounded-xl border-2 border-dashed border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 p-8 text-center transition-all hover:border-[#6a66f0]/40 dark:hover:border-[#9b96f5]/40 hover:bg-[#faf5ff]/50 dark:hover:bg-[#3b0764]/10"
                >
                  <div className="flex flex-col items-center gap-3">
                    <div className="h-14 w-14 rounded-2xl bg-gray-100 dark:bg-white/5 flex items-center justify-center">
                      <Upload className="h-7 w-7 text-gray-400 dark:text-gray-500" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        {language === 'da' ? 'Klik for at uploade' : 'Click to upload'}
                      </p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                        JPG, PNG (max 2MB)
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png"
                onChange={handleLogoUpload}
                className="hidden"
              />

              {/* Info note */}
              <div className="flex items-start gap-2 text-xs text-gray-500 dark:text-gray-400 info-box-blue rounded-lg p-3">
                <Info className="h-4 w-4 shrink-0 mt-0.5 text-[#6a66f0] dark:text-[#9b96f5]" />
                <p>
                  {language === 'da'
                    ? 'Logoet vises i øverste venstre hjørne af dine fakturaer. Det anbefales at bruge et firkantet logo med gennemsigtig baggrund.'
                    : 'The logo appears in the top-left corner of your invoices. A square logo with a transparent background is recommended.'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Invoice Settings Card ── */}
        <Card className="stat-card border-0 shadow-lg dark:border dark:border-white/5">
          <CardHeader className="pb-4">
            <CardTitle className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-[#6a66f0] to-[#554fe9] flex items-center justify-center shrink-0">
                <FileText className="h-4 w-4 text-white" />
              </div>
              {language === 'da' ? 'Fakturaindstillinger' : 'Invoice Settings'}
            </CardTitle>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {language === 'da'
                ? 'Konfigurer præfiks, nummerering og betalingsbetingelser'
                : 'Configure prefix, numbering, and payment terms'}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Invoice Prefix */}
            <div className="space-y-2">
              <Label htmlFor="invoicePrefix" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('invoicePrefix')} <span className="text-red-500">*</span>
              </Label>
              <Input
                id="invoicePrefix"
                value={form.invoicePrefix}
                onChange={(e) => updateField('invoicePrefix', e.target.value.toUpperCase())}
                placeholder={t('invoicePrefixPlaceholder')}
                className="h-10 uppercase"
              />
              <div className="flex items-start gap-2 text-xs text-gray-500 dark:text-gray-400 info-box-turquoise rounded-lg p-3">
                <Info className="h-4 w-4 shrink-0 mt-0.5 text-[#6a66f0] dark:text-[#9b96f5]" />
                <p>{t('invoicePrefixHelp')}</p>
              </div>
            </div>

            {/* Next Invoice Number (read-only) */}
            {companyInfo && (
              <div className="rounded-xl bg-gray-50 dark:bg-white/5 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      {t('nextInvoiceNumber')}
                    </p>
                    <p className="text-lg font-bold text-gray-900 dark:text-white mt-1">
                      {companyInfo.invoicePrefix}{companyInfo.currentYear}-{String(companyInfo.nextInvoiceSequence).padStart(3, '0')}
                    </p>
                  </div>
                  <div className="h-10 w-10 rounded-full stat-icon-purple flex items-center justify-center">
                    <FileText className="h-5 w-5 text-[#6a66f0] dark:text-[#9b96f5]" />
                  </div>
                </div>
              </div>
            )}

            {/* Invoice Terms */}
            <div className="space-y-2">
              <Label htmlFor="invoiceTerms" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('invoiceTerms')}
              </Label>
              <textarea
                id="invoiceTerms"
                value={form.invoiceTerms}
                onChange={(e) => updateField('invoiceTerms', e.target.value)}
                placeholder={t('invoiceTermsPlaceholder')}
                rows={3}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Bottom Save Bar ── */}
      {hasChanges && (
        <div className="sticky bottom-4 z-10">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center justify-between gap-4 rounded-2xl bg-white dark:bg-[#242120] border border-gray-200 dark:border-white/10 shadow-2xl px-4 sm:px-6 py-3 sm:py-4">
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <AlertCircle className="h-4 w-4 text-amber-500" />
                <span className="hidden sm:inline">
                  {language === 'da' ? 'Du har ikke-gemte ændringer' : 'You have unsaved changes'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={fetchCompanyInfo}
                  className="gap-2"
                >
                  {t('cancel')}
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={isSaving}
                  size="sm"
                  className="bg-[#6a66f0] hover:bg-[#554fe9] text-white font-medium gap-2"
                >
                  {isSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  {isSaving
                    ? (language === 'da' ? 'Gemmer...' : 'Saving...')
                    : (language === 'da' ? 'Gem ændringer' : 'Save Changes')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
