'use client';

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, ArrowRight } from 'lucide-react';
import { User } from '@/lib/auth-store';
import { useTranslation } from '@/lib/use-translation';

interface LoginFormProps {
  onSuccess: (user: User) => void;
  onSwitchToRegister: () => void;
}

export function LoginForm({ onSuccess, onSwitchToRegister }: LoginFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { t } = useTranslation();

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError('');
      setIsLoading(true);

      try {
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });

        const data = await response.json();

        if (!response.ok) {
          setError(data.error || t('loginFailed'));
          return;
        }

        onSuccess(data.user);
      } catch {
        setError(t('anErrorOccurred'));
      } finally {
        setIsLoading(false);
      }
    },
    [email, password, onSuccess, t]
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="p-3 text-sm text-red-600 bg-red-50 rounded-lg border border-red-200">
          {error}
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="email" className="text-gray-700">{t('email')}</Label>
        <Input
          id="email"
          type="email"
          placeholder="your@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={isLoading}
          className="bg-white border-gray-200 focus:border-[#554fe9]"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password" className="text-gray-700">{t('password')}</Label>
        <Input
          id="password"
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          disabled={isLoading}
          className="bg-white border-gray-200 focus:border-[#554fe9]"
        />
      </div>
      <Button
        type="submit"
        className="w-full btn-primary text-white font-medium"
        disabled={isLoading}
      >
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {t('signingIn')}
          </>
        ) : (
          <>
            {t('signIn')}
            <ArrowRight className="ml-2 h-4 w-4" />
          </>
        )}
      </Button>
      <div className="relative my-4">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-200"></div>
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-white px-2 text-gray-500">
            {t('or')}
          </span>
        </div>
      </div>
      <p className="text-sm text-center text-gray-600">
        {t('noAccount')}{' '}
        <button
          type="button"
          onClick={onSwitchToRegister}
          className="text-[#005aae] hover:text-[#004a8e] font-medium"
        >
          {t('createOne')}
        </button>
      </p>
    </form>
  );
}
