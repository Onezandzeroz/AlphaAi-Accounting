import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface User {
  id: string;
  email: string;
  businessName?: string | null;
  demoModeEnabled?: boolean;
}

interface AuthState {
  user: User | null;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;
  logout: () => void;
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isLoading: true,
      setUser: (user) => set({ user, isLoading: false }),
      setLoading: (loading) => set({ isLoading: loading }),
      logout: () => {
        set({ user: null, isLoading: false });
        // Call logout API
        if (typeof window !== 'undefined') {
          fetch('/api/auth/logout', { method: 'POST' });
        }
      },
      checkAuth: async () => {
        try {
          const response = await fetch('/api/auth/me');
          const data = await response.json();
          
          if (data.user) {
            set({ user: data.user, isLoading: false });
          } else {
            set({ user: null, isLoading: false });
          }
        } catch (error) {
          console.error('Auth check failed:', error);
          set({ user: null, isLoading: false });
        }
      },
    }),
    {
      name: 'danish-bookkeeping-auth',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ user: state.user }),
    }
  )
);
