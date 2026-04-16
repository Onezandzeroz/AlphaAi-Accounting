'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { User } from '@/lib/auth-store';
import { useTranslation } from '@/lib/use-translation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
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
import {
  Shield,
  Database,
  Download,
  HardDrive,
  RotateCcw,
  Trash2,
  Clock,
  Loader2,
  Plus,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  FileArchive,
  CalendarClock,
  Zap,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';

interface BackupEntry {
  id: string;
  triggerType: 'manual' | 'automatic' | 'scheduled';
  backupType: 'hourly' | 'daily' | 'weekly' | 'monthly';
  filePath: string;
  fileSize: number;
  sha256: string;
  status: 'completed' | 'failed';
  errorMessage: string | null;
  expiresAt: string;
  createdAt: string;
}

interface BackupPageProps {
  user: User;
}

// Format file size in human-readable form
function formatFileSize(bytes: number, language: 'da' | 'en'): string {
  if (bytes === 0) return `0 ${language === 'da' ? 'B' : 'B'}`;
  const units = ['B', 'KB', 'MB', 'GB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const size = bytes / Math.pow(k, i);
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

// Badge color map for backup types
function getBackupTypeBadge(backupType: string) {
  switch (backupType) {
    case 'hourly':
      return 'bg-sky-500/10 text-sky-600 dark:bg-sky-500/20 dark:text-sky-400 border-sky-500/20';
    case 'daily':
      return 'bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400 border-emerald-500/20';
    case 'weekly':
      return 'bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400 border-amber-500/20';
    case 'monthly':
      return 'bg-[#554fe9]/10 text-[#554fe9] dark:bg-[#554fe9]/20 dark:text-[#7a76f0] border-[#554fe9]/20';
    default:
      return '';
  }
}

export function BackupPage({ user }: BackupPageProps) {
  const [backups, setBackups] = useState<BackupEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isRestoring, setIsRestoring] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState<string | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<BackupEntry | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BackupEntry | null>(null);
  const { t, td, language } = useTranslation();

  // Fetch all backups
  const fetchBackups = useCallback(async () => {
    try {
      const response = await fetch('/api/backups');
      if (response.ok) {
        const data = await response.json();
        setBackups(data.backups || []);
      }
    } catch (error) {
      console.error('Failed to fetch backups:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBackups();
  }, [fetchBackups]);

  // Create manual backup
  const handleCreateBackup = useCallback(async () => {
    setIsCreating(true);
    try {
      const response = await fetch('/api/backups', { method: 'POST' });
      if (response.ok) {
        const data = await response.json();
        if (data.backup) {
          setBackups((prev) => [data.backup, ...prev]);
        }
      }
    } catch (error) {
      console.error('Failed to create backup:', error);
    } finally {
      setIsCreating(false);
    }
  }, []);

  // Download backup
  const handleDownload = useCallback(async (backup: BackupEntry) => {
    setIsDownloading(backup.id);
    try {
      const response = await fetch(`/api/backups/download/${backup.id}`);
      if (!response.ok) throw new Error('Download failed');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const dateStr = format(new Date(backup.createdAt), 'yyyy-MM-dd_HH-mm');
      a.download = `backup-${backup.backupType}-${dateStr}.zip`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download backup:', error);
    } finally {
      setIsDownloading(null);
    }
  }, []);

  // Restore from backup
  const handleRestore = useCallback(async () => {
    if (!restoreTarget) return;
    setIsRestoring(restoreTarget.id);
    try {
      const response = await fetch(`/api/backups/${restoreTarget.id}?action=restore`, {
        method: 'POST',
      });
      if (response.ok) {
        // Refresh data after restore
        setRestoreTarget(null);
        await fetchBackups();
      }
    } catch (error) {
      console.error('Failed to restore backup:', error);
    } finally {
      setIsRestoring(null);
    }
  }, [restoreTarget, fetchBackups]);

  // Delete backup
  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setIsDeleting(deleteTarget.id);
    try {
      const response = await fetch(`/api/backups/${deleteTarget.id}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        setBackups((prev) => prev.filter((b) => b.id !== deleteTarget.id));
        setDeleteTarget(null);
      }
    } catch (error) {
      console.error('Failed to delete backup:', error);
    } finally {
      setIsDeleting(null);
    }
  }, [deleteTarget]);

  // Stats
  const stats = useMemo(() => {
    const completedBackups = backups.filter((b) => b.status === 'completed');
    const latestBackup = completedBackups.length > 0
      ? completedBackups[0]
      : null;
    const totalStorage = completedBackups.reduce((sum, b) => sum + b.fileSize, 0);
    const failedCount = backups.filter((b) => b.status === 'failed').length;

    return {
      totalBackups: backups.length,
      latestBackup,
      totalStorage,
      failedCount,
    };
  }, [backups]);

  // Retention policy data
  const retentionPolicy = useMemo(() => {
    if (language === 'da') {
      return [
        { type: 'Timesvis', count: 24, period: '25 timer', color: 'bg-sky-500/10 text-sky-600 dark:bg-sky-500/20 dark:text-sky-400' },
        { type: 'Daglig', count: 30, period: '31 dage', color: 'bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400' },
        { type: 'Ugentlig', count: 52, period: '53 uger', color: 'bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400' },
        { type: 'Månedlig', count: 60, period: '1 år', color: 'bg-[#554fe9]/10 text-[#554fe9] dark:bg-[#554fe9]/20 dark:text-[#7a76f0]' },
      ];
    }
    return [
      { type: 'Hourly', count: 24, period: '25 hours', color: 'bg-sky-500/10 text-sky-600 dark:bg-sky-500/20 dark:text-sky-400' },
      { type: 'Daily', count: 30, period: '31 days', color: 'bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400' },
      { type: 'Weekly', count: 52, period: '53 weeks', color: 'bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400' },
      { type: 'Monthly', count: 60, period: '1 year', color: 'bg-[#554fe9]/10 text-[#554fe9] dark:bg-[#554fe9]/20 dark:text-[#7a76f0]' },
    ];
  }, [language]);

  // Loading skeleton
  if (isLoading) {
    return (
      <div className="p-4 lg:p-8 space-y-6">
        {/* Header skeleton */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-8 w-56" />
            <Skeleton className="h-4 w-80" />
          </div>
          <Skeleton className="h-10 w-44" />
        </div>

        {/* Stats skeleton */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="stat-card">
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-7 w-16" />
                  </div>
                  <Skeleton className="h-10 w-10 rounded-full" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Table skeleton */}
        <Card className="stat-card">
          <CardHeader className="pb-3">
            <Skeleton className="h-6 w-48" />
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 p-4 rounded-xl bg-gray-50">
                  <Skeleton className="h-6 w-16" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-28 flex-1" />
                  <Skeleton className="h-4 w-16" />
                  <div className="flex gap-2">
                    <Skeleton className="h-8 w-8" />
                    <Skeleton className="h-8 w-8" />
                    <Skeleton className="h-8 w-8" />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8 space-y-6">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Shield className="h-6 w-6 text-[#554fe9]" />
            {language === 'da' ? 'Sikkerhedskopiering' : 'Data Backup'}
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            {language === 'da'
              ? 'Automatiske sikkerhedskopier i henhold til §15 i Bogføringsloven'
              : 'Automated data backups compliant with §15 of the Danish Bookkeeping Act'}
          </p>
        </div>
        <Button
          onClick={handleCreateBackup}
          disabled={isCreating}
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium gap-2 shadow-lg shadow-emerald-600/20 transition-all"
        >
          {isCreating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          {language === 'da' ? 'Opret kopi nu' : 'Create Backup Now'}
        </Button>
      </div>

      {/* Compliance Banner */}
      <Card className="relative overflow-hidden border-2 border-[#554fe9]/20 dark:border-[#554fe9]/30 shadow-xl">
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-[#554fe9]/10 to-transparent rounded-full blur-3xl transform translate-x-1/3 -translate-y-1/3" />
        <CardContent className="relative p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-2xl bg-gradient-to-br from-[#554fe9] to-[#7a76f0] flex items-center justify-center shrink-0 shadow-lg">
              <Shield className="h-6 w-6 sm:h-7 sm:w-7 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white">
                  {language === 'da' ? 'Bogføringsloven §15' : 'Danish Bookkeeping Act §15'}
                </h3>
                <Badge className="bg-[#554fe9]/10 text-[#554fe9] border-[#554fe9]/20 dark:bg-[#554fe9]/20 dark:text-[#7a76f0] dark:border-[#554fe9]/30">
                  {language === 'da' ? 'Lovkrav' : 'Legal Requirement'}
                </Badge>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {language === 'da'
                  ? 'Virksomheder skal opbevare regnskabsmateriale i mindst 5 år. Automatiske sikkerhedskopier sikrer, at dine data altid er sikrede og tilgængelige ved revision.'
                  : 'Businesses must retain accounting records for at least 5 years. Automated backups ensure your data is always secure and available for auditing.'}
              </p>
            </div>
            <div className="hidden md:flex items-center gap-2 shrink-0">
              <div className="text-center px-3 py-2 rounded-lg bg-[#554fe9]/5 dark:bg-[#554fe9]/10">
                <p className="text-lg font-bold text-[#554fe9] dark:text-[#7a76f0]">5</p>
                <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {language === 'da' ? 'År opbevaring' : 'Years Retention'}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Total Backups */}
        <Card className="stat-card">
          <CardContent className="p-3 sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                  {language === 'da' ? 'Totale kopier' : 'Total Backups'}
                </p>
                <p className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white mt-0.5 sm:mt-1">
                  {stats.totalBackups}
                </p>
              </div>
              <div className="h-9 w-9 sm:h-12 sm:w-12 rounded-full stat-icon-primary flex items-center justify-center">
                <Database className="h-4 w-4 sm:h-6 sm:w-6 text-[#554fe9] dark:text-[#7a76f0]" />
              </div>
            </div>
            {stats.failedCount > 0 && (
              <div className="mt-1.5 sm:mt-3 flex items-center text-xs sm:text-sm text-red-500 dark:text-red-400">
                <AlertTriangle className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                {stats.failedCount} {language === 'da' ? 'fejlede' : 'failed'}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Latest Backup */}
        <Card className="stat-card">
          <CardContent className="p-3 sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                  {language === 'da' ? 'Seneste kopi' : 'Latest Backup'}
                </p>
                {stats.latestBackup ? (
                  <p className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white mt-0.5 sm:mt-1">
                    {formatDistanceToNow(new Date(stats.latestBackup.createdAt), { addSuffix: false })}
                  </p>
                ) : (
                  <p className="text-lg sm:text-2xl font-bold text-gray-400 dark:text-gray-500 mt-0.5 sm:mt-1">
                    —
                  </p>
                )}
              </div>
              <div className="h-9 w-9 sm:h-12 sm:w-12 rounded-full stat-icon-green flex items-center justify-center">
                <Clock className="h-4 w-4 sm:h-6 sm:w-6 text-green-600 dark:text-green-400" />
              </div>
            </div>
            {stats.latestBackup && (
              <div className="mt-1.5 sm:mt-3 flex items-center text-xs sm:text-sm text-green-600 dark:text-green-400">
                <CheckCircle2 className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                {stats.latestBackup.status === 'completed'
                  ? (language === 'da' ? 'Gennemført' : 'Completed')
                  : (language === 'da' ? 'Fejlet' : 'Failed')}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Total Storage */}
        <Card className="stat-card">
          <CardContent className="p-3 sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                  {language === 'da' ? 'Total lagring' : 'Total Storage'}
                </p>
                <p className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white mt-0.5 sm:mt-1">
                  {formatFileSize(stats.totalStorage, language)}
                </p>
              </div>
              <div className="h-9 w-9 sm:h-12 sm:w-12 rounded-full stat-icon-amber flex items-center justify-center">
                <HardDrive className="h-4 w-4 sm:h-6 sm:w-6 text-amber-600 dark:text-amber-400" />
              </div>
            </div>
            <div className="mt-1.5 sm:mt-3 flex items-center text-xs sm:text-sm text-gray-500 dark:text-gray-400">
              <HardDrive className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
              {language === 'da' ? 'Brugt plads' : 'Used space'}
            </div>
          </CardContent>
        </Card>

        {/* Compliance Status */}
        <Card className="stat-card">
          <CardContent className="p-3 sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                  {language === 'da' ? 'Overholdelse' : 'Compliance'}
                </p>
                <p className={`text-lg sm:text-2xl font-bold mt-0.5 sm:mt-1 ${
                  stats.latestBackup
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-amber-600 dark:text-amber-400'
                }`}>
                  {stats.latestBackup
                    ? (language === 'da' ? 'I orden' : 'OK')
                    : (language === 'da' ? 'Advarsel' : 'Warning')}
                </p>
              </div>
              <div className={`h-9 w-9 sm:h-12 sm:w-12 rounded-full flex items-center justify-center ${
                stats.latestBackup ? 'stat-icon-green' : 'stat-icon-amber'
              }`}>
                <Shield className={`h-4 w-4 sm:h-6 sm:w-6 ${
                  stats.latestBackup
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-amber-600 dark:text-amber-400'
                }`} />
              </div>
            </div>
            <div className={`mt-1.5 sm:mt-3 flex items-center text-xs sm:text-sm ${
              stats.latestBackup
                ? 'text-green-600 dark:text-green-400'
                : 'text-amber-600 dark:text-amber-400'
            }`}>
              <Shield className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
              {stats.latestBackup
                ? (language === 'da' ? '§15 opfyldt' : '§15 Compliant')
                : (language === 'da' ? 'Opret en kopi' : 'Create a backup')}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Retention Policy */}
      <Card className="stat-card border-0 shadow-lg dark:border dark:border-white/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-[#554fe9]" />
            {language === 'da' ? 'Opbevaringspolitik' : 'Retention Policy'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {retentionPolicy.map((policy) => (
              <div
                key={policy.type}
                className="rounded-xl bg-gray-50 p-3 sm:p-4"
              >
                <p className={`text-xs font-semibold px-2 py-0.5 rounded-full inline-block mb-2 ${policy.color}`}>
                  {policy.type}
                </p>
                <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
                  {policy.count}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {language === 'da' ? 'kopier' : 'backups'}
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  ({policy.period})
                </p>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-start gap-2 text-xs text-gray-500 dark:text-gray-400 info-box-primary rounded-lg p-3">
            <Info className="h-4 w-4 shrink-0 mt-0.5 text-[#554fe9] dark:text-[#7a76f0]" />
            <p>
              {language === 'da'
                ? 'Ældre sikkerhedskopier slettes automatisk i henhold til politikken ovenfor for at frigøre lagerplads. Manuelle kopier opbevares i 30 dage.'
                : 'Older backups are automatically deleted according to the policy above to free up storage. Manual backups are retained for 30 days.'}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Backup List */}
      <Card className="stat-card border-0 shadow-lg dark:border dark:border-white/5">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <FileArchive className="h-5 w-5 text-[#554fe9]" />
              {language === 'da' ? 'Sikkerhedskopier' : 'Backups'}
              <Badge variant="outline" className="text-xs font-normal">
                {backups.length}
              </Badge>
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchBackups}
              className="gap-1 text-gray-500 hover:text-[#554fe9] dark:text-gray-400"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {language === 'da' ? 'Opdater' : 'Refresh'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {backups.length === 0 ? (
            /* Empty State */
            <div className="text-center py-12">
              <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-gray-100 mb-4">
                <Database className="h-8 w-8 text-gray-400 dark:text-gray-500" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                {language === 'da' ? 'Ingen sikkerhedskopier endnu' : 'No backups yet'}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 max-w-sm mx-auto">
                {language === 'da'
                  ? 'Opret din første sikkerhedskopi for at sikre dine regnskabsdata i henhold til loven.'
                  : 'Create your first backup to secure your accounting data in compliance with regulations.'}
              </p>
              <Button
                onClick={handleCreateBackup}
                disabled={isCreating}
                className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
              >
                {isCreating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                {language === 'da' ? 'Opret første kopi' : 'Create First Backup'}
              </Button>
            </div>
          ) : (
            /* Backup List */
            <div className="space-y-2 max-h-[600px] overflow-y-auto">
              {backups.map((backup) => (
                <div
                  key={backup.id}
                  className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-xl bg-gray-50 hover:bg-gray-100 dark:hover:bg-white/8 transition-colors"
                >
                  {/* Left: Type & Trigger */}
                  <div className="flex items-center gap-3 sm:w-40 shrink-0">
                    <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${
                      backup.backupType === 'hourly' ? 'stat-icon-turquoise' :
                      backup.backupType === 'daily' ? 'stat-icon-green' :
                      backup.backupType === 'weekly' ? 'stat-icon-amber' :
                      'stat-icon-purple'
                    }`}>
                      {backup.backupType === 'hourly' ? (
                        <Zap className="h-5 w-5 text-sky-600 dark:text-sky-400" />
                      ) : backup.backupType === 'daily' ? (
                        <Clock className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                      ) : backup.backupType === 'weekly' ? (
                        <CalendarClock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                      ) : (
                        <Database className="h-5 w-5 text-[#554fe9] dark:text-[#7a76f0]" />
                      )}
                    </div>
                    <div>
                      <Badge className={`text-[10px] sm:text-xs px-1.5 sm:px-2 ${getBackupTypeBadge(backup.backupType)}`}>
                        {backup.backupType}
                      </Badge>
                      <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {backup.triggerType === 'manual'
                          ? (language === 'da' ? 'Manuel' : 'Manual')
                          : backup.triggerType === 'automatic'
                            ? (language === 'da' ? 'Automatisk' : 'Automatic')
                            : (language === 'da' ? 'Planlagt' : 'Scheduled')}
                      </p>
                    </div>
                  </div>

                  {/* Middle: Size & Date */}
                  <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center sm:gap-4">
                    <div className="text-sm text-gray-600 dark:text-gray-300">
                      <span className="font-medium">{formatFileSize(backup.fileSize, language)}</span>
                    </div>
                    <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                      {formatDistanceToNow(new Date(backup.createdAt), { addSuffix: true })}
                    </div>
                    <div className="text-xs text-gray-400 dark:text-gray-500 hidden lg:block">
                      {format(new Date(backup.createdAt), 'dd/MM/yyyy HH:mm')}
                    </div>
                  </div>

                  {/* Right: Status & Actions */}
                  <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                    {/* Status Badge */}
                    {backup.status === 'completed' ? (
                      <Badge className="badge-green text-[10px] sm:text-xs gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        <span className="hidden sm:inline">
                          {language === 'da' ? 'Gennemført' : 'Completed'}
                        </span>
                      </Badge>
                    ) : (
                      <Badge className="badge-red text-[10px] sm:text-xs gap-1">
                        <XCircle className="h-3 w-3" />
                        <span className="hidden sm:inline">
                          {language === 'da' ? 'Fejlet' : 'Failed'}
                        </span>
                      </Badge>
                    )}

                    {/* Action Buttons */}
                    <div className="flex items-center gap-1">
                      {/* Download */}
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDownload(backup)}
                              disabled={isDownloading === backup.id || backup.status !== 'completed'}
                              className="text-gray-400 hover:text-[#554fe9] dark:hover:text-[#7a76f0]"
                            >
                              {isDownloading === backup.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Download className="h-4 w-4" />
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{language === 'da' ? 'Download' : 'Download'}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>

                      {/* Restore */}
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setRestoreTarget(backup)}
                              disabled={isRestoring === backup.id || backup.status !== 'completed'}
                              className="text-gray-400 hover:text-amber-600 dark:hover:text-amber-400"
                            >
                              {isRestoring === backup.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <RotateCcw className="h-4 w-4" />
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{language === 'da' ? 'Gendan fra kopi' : 'Restore from backup'}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>

                      {/* Delete */}
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDeleteTarget(backup)}
                              disabled={isDeleting === backup.id}
                              className="text-gray-400 hover:text-red-500"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{language === 'da' ? 'Slet kopi' : 'Delete backup'}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Restore Confirmation Dialog */}
      <AlertDialog open={!!restoreTarget} onOpenChange={(open) => { if (!open) setRestoreTarget(null); }}>
        <AlertDialogContent className="bg-white max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="dark:text-white flex items-center gap-2 text-xl">
              <div className="h-10 w-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
                <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              {language === 'da' ? 'Gendan fra sikkerhedskopi?' : 'Restore from Backup?'}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 pt-2">
                <p className="text-gray-600 dark:text-gray-400">
                  {language === 'da'
                    ? 'Dette vil overskrive alle nuværende data med data fra den valgte sikkerhedskopi. Denne handling kan ikke fortrydes!'
                    : 'This will overwrite all current data with data from the selected backup. This action cannot be undone!'}
                </p>

                {/* Backup details */}
                {restoreTarget && (
                  <div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/50 rounded-lg p-3 space-y-1.5">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500 dark:text-gray-400">
                        {language === 'da' ? 'Type' : 'Type'}:
                      </span>
                      <span className="font-medium text-gray-900 dark:text-white capitalize">
                        {restoreTarget.backupType}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500 dark:text-gray-400">
                        {language === 'da' ? 'Dato' : 'Date'}:
                      </span>
                      <span className="font-medium text-gray-900 dark:text-white">
                        {format(new Date(restoreTarget.createdAt), 'dd/MM/yyyy HH:mm')}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500 dark:text-gray-400">
                        {language === 'da' ? 'Størrelse' : 'Size'}:
                      </span>
                      <span className="font-medium text-gray-900 dark:text-white">
                        {formatFileSize(restoreTarget.fileSize, language)}
                      </span>
                    </div>
                  </div>
                )}

                {/* Safety note */}
                <div className="flex items-start gap-2 text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/50 rounded-lg p-3">
                  <Info className="h-4 w-4 shrink-0 mt-0.5" />
                  <p>
                    {language === 'da'
                      ? 'Tip: Opret en ny sikkerhedskopi af de nuværende data, før du gendanner, så du altid kan vende tilbage.'
                      : 'Tip: Create a new backup of your current data before restoring, so you can always revert back.'}
                  </p>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel className="dark:bg-white/5 dark:text-gray-300" onClick={() => setRestoreTarget(null)}>
              {language === 'da' ? 'Annuller' : 'Cancel'}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRestore}
              disabled={isRestoring !== null}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              {isRestoring ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  {language === 'da' ? 'Gendanner...' : 'Restoring...'}
                </>
              ) : (
                <>
                  <RotateCcw className="h-4 w-4 mr-2" />
                  {language === 'da' ? 'Gendan data' : 'Restore Data'}
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent className="bg-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="dark:text-white flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-red-500" />
              {language === 'da' ? 'Slet sikkerhedskopi?' : 'Delete Backup?'}
            </AlertDialogTitle>
            <AlertDialogDescription className="dark:text-gray-400">
              {language === 'da'
                ? 'Er du sikker på, at du vil slette denne sikkerhedskopi? Denne handling kan ikke fortrydes.'
                : 'Are you sure you want to delete this backup? This action cannot be undone.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="dark:bg-white/5 dark:text-gray-300" onClick={() => setDeleteTarget(null)}>
              {language === 'da' ? 'Annuller' : 'Cancel'}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting !== null}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  {language === 'da' ? 'Sletter...' : 'Deleting...'}
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  {language === 'da' ? 'Slet' : 'Delete'}
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
