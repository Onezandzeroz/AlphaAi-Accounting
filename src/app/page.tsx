'use client';

import { useState, useCallback, useEffect, useSyncExternalStore, useRef } from 'react';
import Image from 'next/image';
import { useAuthStore, User } from '@/lib/auth-store';
import { useTranslation } from '@/lib/use-translation';
import { LoginForm } from '@/components/auth/login-form';
import { RegisterForm } from '@/components/auth/register-form';
import { AppLayout } from '@/components/layout/app-layout';
import { Dashboard } from '@/components/dashboard/dashboard';
import { TransactionsPage } from '@/components/transactions/transactions-page';
import { VATReport } from '@/components/vat-report/vat-report';
import { ExportsPage } from '@/components/exports/exports-page';
import { InvoicesPage } from '@/components/invoices/invoices-page';
import { BackupPage } from '@/components/backup/backup-page';
import { AuditLogPage } from '@/components/audit-log/audit-log-page';
import { ChartOfAccountsPage } from '@/components/chart-of-accounts/chart-of-accounts-page';
import { JournalEntriesPage } from '@/components/journal/journal-entries-page';
import { ContactsPage } from '@/components/contacts/contacts-page';
import { FiscalPeriodsPage } from '@/components/fiscal-periods/fiscal-periods-page';
import { LedgerPage } from '@/components/ledger/ledger-page';
import { ReportsPage } from '@/components/reports/reports-page';
import { BankReconciliationPage } from '@/components/bank-reconciliation/bank-reconciliation-page';
import { YearEndClosingPage } from '@/components/year-end-closing/year-end-closing-page';
import { AgingReportsPage } from '@/components/aging-reports/aging-reports-page';
import { CashFlowPage } from '@/components/cash-flow/cash-flow-page';
import { RecurringEntriesPage } from '@/components/recurring-entries/recurring-entries-page';
import { BudgetPage } from '@/components/budget/budget-page';
import { CompanySettingsPage } from '@/components/settings/company-settings-page';
import { Loader2 } from 'lucide-react';

type View = 'dashboard' | 'transactions' | 'vat-report' | 'exports' | 'invoices' | 'backups' | 'audit-log' | 'accounts' | 'journal' | 'contacts' | 'periods' | 'ledger' | 'reports' | 'bank-recon' | 'year-end' | 'aging' | 'cash-flow' | 'recurring' | 'budget' | 'settings';

// Custom hook to check if we're hydrated (client-side)
function useHydrated() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
}

export default function Home() {
  const { user, setUser, isLoading, checkAuth } = useAuthStore();
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const hydrated = useHydrated();
  const hasCheckedAuth = useRef(false);
  const { t, language } = useTranslation();

  // Check auth status once after hydration
  useEffect(() => {
    if (!hydrated || hasCheckedAuth.current) return;
    
    hasCheckedAuth.current = true;
    checkAuth();
  }, [hydrated, checkAuth]);

  const handleLoginSuccess = useCallback((loggedInUser: User) => {
    setUser(loggedInUser);
  }, [setUser]);

  const handleRegisterSuccess = useCallback((registeredUser: User) => {
    setUser(registeredUser);
  }, [setUser]);

  const handleLogout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
    setCurrentView('dashboard');
  }, [setUser]);

  const handleDeleteAccount = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/delete-account', { method: 'DELETE' });
      if (response.ok) {
        setUser(null);
        setCurrentView('dashboard');
      }
    } catch (error) {
      console.error('Failed to delete account:', error);
    }
  }, [setUser]);

  if (!hydrated || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8f9fc] light-forced">
        <div className="flex flex-col items-center gap-4">
          <div className="relative h-12 w-12">
            <div className="absolute inset-0 rounded-full animate-spin" style={{ background: 'conic-gradient(from 0deg, #554fe9, #7a76f0, #554fe9)', animationDuration: '1.5s' }} />
            <div className="absolute inset-1 rounded-full bg-[#f8f9fc]" />
          </div>
          <p className="text-gray-500 text-sm">{t('loading')}</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col bg-gray-50 light-forced">
        <main className="flex-1 flex items-center justify-center p-4">
          <div className="w-full max-w-md flex flex-col items-center mt-[57px]">
            {/* Logo */}
            <div className="mb-[44px] -mt-[19px]">
              <Image
                src="/logo-clean.png"
                alt="AlphaAi"
                width={153}
                height={62}
                className="object-contain dark:invert"
                priority
              />
            </div>

            {/* Subtitle & Description */}
            <div className="text-center mb-6">
              <h2 className="text-gray-800 text-2xl font-semibold">
                Accounting
              </h2>
              <p className="text-gray-500 text-[15px] mt-2">
                Intelligent Skat & Moms for moderne virksomheder
              </p>
            </div>

            {/* Login Card */}
            <div className="w-full bg-white rounded-2xl p-6 shadow-lg border border-[#e2e5f0]">
              {authMode === 'login' ? (
                <LoginForm
                  onSuccess={handleLoginSuccess}
                  onSwitchToRegister={() => setAuthMode('register')}
                />
              ) : (
                <RegisterForm
                  onSuccess={handleRegisterSuccess}
                  onSwitchToLogin={() => setAuthMode('login')}
                />
              )}
            </div>

            <p className="text-center text-xs text-gray-400 mt-6">
              {t('poweredByOCR')}
            </p>
          </div>
        </main>
        <footer className="py-4 text-center text-sm text-gray-400">
          © {new Date().getFullYear()} AlphaAi {language === 'da' ? 'Bogføringsapp' : 'Accounting'}
        </footer>
      </div>
    );
  }

  const renderView = () => {
    switch (currentView) {
      case 'transactions':
        return <TransactionsPage user={user} />;
      case 'invoices':
        return <InvoicesPage user={user} />;
      case 'vat-report':
        return <VATReport user={user} />;
      case 'exports':
        return <ExportsPage user={user} />;
      case 'backups':
        return <BackupPage user={user} />;
      case 'audit-log':
        return <AuditLogPage user={user} />;
      case 'accounts':
        return <ChartOfAccountsPage user={user} />;
      case 'journal':
        return <JournalEntriesPage user={user} />;
      case 'contacts':
        return <ContactsPage user={user} />;
      case 'periods':
        return <FiscalPeriodsPage user={user} />;
      case 'ledger':
        return <LedgerPage user={user} />;
      case 'reports':
        return <ReportsPage user={user} />;
      case 'bank-recon':
        return <BankReconciliationPage user={user} />;
      case 'year-end':
        return <YearEndClosingPage user={user} />;
      case 'aging':
        return <AgingReportsPage user={user} />;
      case 'cash-flow':
        return <CashFlowPage user={user} />;
      case 'recurring':
        return <RecurringEntriesPage user={user} />;
      case 'budget':
        return <BudgetPage user={user} />;
      case 'settings':
        return <CompanySettingsPage user={user} onNavigate={(view) => setCurrentView(view as View)} />;
      default:
        return <Dashboard user={user} onNavigate={(view) => setCurrentView(view as View)} />;
    }
  };

  return (
    <AppLayout
      user={user}
      currentView={currentView}
      onViewChange={setCurrentView}
      onLogout={handleLogout}
      onDeleteAccount={handleDeleteAccount}
    >
      {renderView()}
    </AppLayout>
  );
}
