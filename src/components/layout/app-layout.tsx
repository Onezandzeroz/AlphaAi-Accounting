'use client';

import { useState, useEffect, useSyncExternalStore } from 'react';
import Image from 'next/image';
import { User } from '@/lib/auth-store';
import { useLanguageStore } from '@/lib/language-store';
import { useTranslation } from '@/lib/use-translation';
import { AccordionNav } from '@/components/layout/accordion-nav';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from '@/components/ui/sheet';
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
  LogOut,
  Menu,
  Moon,
  Sun,
  X,
  Sparkles,
  Languages,
  Trash2,
  AlertTriangle,
  FlaskConical,
  EyeOff,
} from 'lucide-react';

type View = 'dashboard' | 'transactions' | 'vat-report' | 'exports' | 'invoices' | 'backups' | 'audit-log' | 'accounts' | 'journal' | 'contacts' | 'periods' | 'ledger' | 'reports' | 'bank-recon' | 'year-end' | 'aging' | 'cash-flow' | 'recurring' | 'budget' | 'settings';

interface AppLayoutProps {
  user: User;
  currentView: View;
  onViewChange: (view: View) => void;
  onLogout: () => void;
  onDeleteAccount: () => void;
  children: React.ReactNode;
}

// Custom hook for dark mode with hydration safety
function useDarkMode() {
  const getSnapshot = () => {
    if (typeof window === 'undefined') return false;
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    return savedTheme === 'dark' || (!savedTheme && prefersDark);
  };

  const getServerSnapshot = () => false;

  const darkMode = useSyncExternalStore(
    (callback) => {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      mediaQuery.addEventListener('change', callback);
      window.addEventListener('storage', callback);
      return () => {
        mediaQuery.removeEventListener('change', callback);
        window.removeEventListener('storage', callback);
      };
    },
    getSnapshot,
    getServerSnapshot
  );

  const toggleDarkMode = () => {
    const newMode = !darkMode;
    localStorage.setItem('theme', newMode ? 'dark' : 'light');
    document.documentElement.classList.toggle('dark', newMode);
    // Force re-render
    window.dispatchEvent(new StorageEvent('storage'));
  };

  return { darkMode, toggleDarkMode };
}

// Hook for hydration
function useMounted() {
  const getSnapshot = () => true;
  const getServerSnapshot = () => false;
  return useSyncExternalStore(() => () => {}, getSnapshot, getServerSnapshot);
}

export function AppLayout({
  user,
  currentView,
  onViewChange,
  onLogout,
  onDeleteAccount,
  children,
}: AppLayoutProps) {
  const { darkMode, toggleDarkMode } = useDarkMode();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const mounted = useMounted();
  const { t } = useTranslation();
  const { language, toggleLanguage } = useLanguageStore();

  // Apply dark mode class on mount and when darkMode changes
  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

  const handleNavClick = (view: View) => {
    onViewChange(view);
    setSidebarOpen(false);
  };

  const handleDeleteAccount = async () => {
    setIsDeletingAccount(true);
    try {
      await onDeleteAccount();
    } finally {
      setIsDeletingAccount(false);
    }
  };

  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#faf9f7] dark:bg-[#1a1816]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#554fe9] border-t-transparent" />
      </div>
    );
  }

  // Shared user controls for desktop and mobile sidebars
  const UserControls = () => (
    <div className="border-t border-[#e8e3dc] dark:border-[#3a3530] p-4 space-y-3">
      <div className="flex items-center gap-2 min-w-0">
        <div className="h-8 w-8 rounded-full avatar-gradient flex items-center justify-center shrink-0">
          <span className="text-sm font-medium text-white">
            {user.email?.[0]?.toUpperCase() || 'U'}
          </span>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-[#2c2a27] dark:text-[#e8e4df] truncate">
            {user.businessName || t('user')}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
            {user.email}
          </p>
        </div>
      </div>

      {/* Demo Mode Toggle */}
      {user.demoModeEnabled && (
        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50">
          <FlaskConical className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
          <span className="text-xs font-medium text-amber-700 dark:text-amber-300 flex-1">
            {language === 'da' ? 'Demo-tilstand' : 'Demo Mode'}
          </span>
        </div>
      )}

      <div className="flex items-center gap-2">
        {/* Language Toggle */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={toggleLanguage}
                className="flex-1 gap-1.5 text-xs font-medium"
              >
                <Languages className="h-3.5 w-3.5" />
                <span>{language === 'da' ? 'DA' : 'EN'}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {language === 'da' ? t('englishUI') : t('danishUI')}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Dark Mode Toggle */}
        <Button
          variant="outline"
          size="sm"
          onClick={toggleDarkMode}
          className="flex-1 gap-2"
        >
          {darkMode ? (
            <>
              <Sun className="h-4 w-4" />
              <span>{t('light')}</span>
            </>
          ) : (
            <>
              <Moon className="h-4 w-4" />
              <span>{t('dark')}</span>
            </>
          )}
        </Button>
      </div>

      {/* Logout & Delete Account */}
      <div className="flex items-center gap-2">
        {/* Logout with confirmation */}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="flex-1 gap-2 text-slate-600 dark:text-gray-300 hover:text-red-600 dark:hover:text-red-400 hover:border-red-300 dark:hover:border-red-700"
            >
              <LogOut className="h-4 w-4" />
              <span>{t('logout')}</span>
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('logoutTitle')}</AlertDialogTitle>
              <AlertDialogDescription>{t('logoutDescription')}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
              <AlertDialogAction onClick={onLogout} className="bg-red-600 hover:bg-red-700 focus:ring-red-600">
                {t('logout')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Delete Account with confirmation */}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="gap-2 text-red-500 hover:text-red-600 hover:border-red-300 dark:hover:border-red-700 dark:text-red-400 dark:hover:text-red-300"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-red-600 dark:text-red-400">
                <AlertTriangle className="h-5 w-5" />
                {t('deleteAccountTitle')}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t('deleteAccountDescription')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteAccount}
                disabled={isDeletingAccount}
                className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
              >
                {isDeletingAccount ? t('deletingAccount') : t('deleteAccountConfirm')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#faf9f7] dark:bg-[#1a1816] transition-colors duration-300">
      {/* Desktop Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-50 hidden lg:flex w-64 flex-col bg-white dark:bg-[#1e1c1a] border-r border-[#e8e3dc] dark:border-[#3a3530] shadow-sm">
        {/* Logo */}
        <div className="flex items-center px-6 pt-8 pb-4 border-b border-[#e8e3dc] dark:border-[#3a3530]">
          <Image
            src="/logo-clean.png"
            alt="AlphaAi Accounting"
            width={140}
            height={57}
            className="object-contain dark:invert"
            priority
          />
        </div>

        {/* Accordion Navigation */}
        <div className="flex-1 flex flex-col min-h-0">
          <AccordionNav
            currentView={currentView}
            onViewChange={handleNavClick}
          />
        </div>

        {/* User & Controls */}
        <UserControls />
      </aside>

      {/* Mobile Header & Sidebar */}
      <div className="lg:hidden fixed inset-x-0 top-0 z-40 bg-white dark:bg-[#1e1c1a] border-b border-[#e8e3dc] dark:border-[#3a3530]">
        <div className="flex items-center justify-between h-16 px-4">
          <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="sm" className="lg:hidden">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0 bg-white dark:bg-[#1e1c1a] flex flex-col">
              <SheetTitle className="sr-only">{t('navigationMenu')}</SheetTitle>
              {/* Mobile Logo */}
              <div className="flex h-16 items-center justify-between px-6 border-b border-[#e8e3dc] dark:border-[#3a3530] shrink-0">
                <Image
                  src="/logo-clean.png"
                  alt="AlphaAi Accounting"
                  width={120}
                  height={49}
                  className="object-contain dark:invert"
                  priority
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSidebarOpen(false)}
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>

              {/* Mobile Accordion Navigation */}
              <div className="flex-1 flex flex-col min-h-0">
                <AccordionNav
                  currentView={currentView}
                  onViewChange={handleNavClick}
                />
              </div>

              {/* Mobile User Controls */}
              <div className="shrink-0 border-t border-[#e8e3dc] dark:border-[#3a3530] p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full avatar-gradient flex items-center justify-center shrink-0">
                    <span className="text-sm font-medium text-white">
                      {user.email?.[0]?.toUpperCase() || 'U'}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[#2c2a27] dark:text-[#e8e4df] truncate">
                      {user.businessName || t('user')}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {user.email}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={toggleLanguage}
                    className="gap-1.5"
                  >
                    <Languages className="h-4 w-4" />
                    {language === 'da' ? 'DA' : 'EN'}
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={toggleDarkMode}
                    className="flex-1 gap-2"
                  >
                    {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                    {darkMode ? t('light') : t('dark')}
                  </Button>
                </div>

                {/* Mobile Logout & Delete Account */}
                <div className="flex items-center gap-2">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 gap-2 text-slate-600 dark:text-gray-300 hover:text-red-600 dark:hover:text-red-400"
                      >
                        <LogOut className="h-4 w-4" />
                        <span>{t('logout')}</span>
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t('logoutTitle')}</AlertDialogTitle>
                        <AlertDialogDescription>{t('logoutDescription')}</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
                        <AlertDialogAction onClick={onLogout} className="bg-red-600 hover:bg-red-700 focus:ring-red-600">
                          {t('logout')}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2 text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2 text-red-600 dark:text-red-400">
                          <AlertTriangle className="h-5 w-5" />
                          {t('deleteAccountTitle')}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          {t('deleteAccountDescription')}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={handleDeleteAccount}
                          disabled={isDeletingAccount}
                          className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
                        >
                          {isDeletingAccount ? t('deletingAccount') : t('deleteAccountConfirm')}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            </SheetContent>
          </Sheet>

          <Image
            src="/logo-clean.png"
            alt="AlphaAi Accounting"
            width={90}
            height={37}
            className="object-contain dark:invert"
          />

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleLanguage}
              className="text-xs font-medium"
            >
              {language === 'da' ? 'DA' : 'EN'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleDarkMode}
            >
              {darkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="lg:pl-64 pt-16 lg:pt-0">
        <div className="min-h-screen">
          {children}
        </div>
      </main>
    </div>
  );
}
