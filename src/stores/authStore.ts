import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { authApi } from '../api/authApi';
import { setApiToken } from '../api/apiClient';
import type { UserProfileDto } from '../types/community';

interface AuthState {
  user: UserProfileDto | null;
  token: string | null;
  isLoading: boolean;
  error: string | null;
}

interface AuthActions {
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  clearError: () => void;
  restoreSession: () => Promise<void>;
  /** Update the in-memory access token (called by apiClient after a silent refresh). */
  setToken: (token: string) => void;
}

export const useAuthStore = create<AuthState & AuthActions>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isLoading: false,
      error: null,

      login: async (email, password) => {
        set({ isLoading: true, error: null });
        try {
          const { accessToken } = await authApi.login({ email, password });
          setApiToken(accessToken);
          set({ token: accessToken });
          const user = await authApi.fetchProfile();
          set({ user, isLoading: false });
        } catch (err) {
          set({
            isLoading: false,
            error: err instanceof Error ? err.message : 'Login failed',
            token: null,
            user: null,
          });
          throw err;
        }
      },

      register: async (name, email, password) => {
        set({ isLoading: true, error: null });
        try {
          const { accessToken } = await authApi.register({ name, email, password });
          setApiToken(accessToken);
          set({ token: accessToken });
          const user = await authApi.fetchProfile();
          set({ user, isLoading: false });
        } catch (err) {
          set({
            isLoading: false,
            error: err instanceof Error ? err.message : 'Registration failed',
            token: null,
            user: null,
          });
          throw err;
        }
      },

      logout: () => {
        setApiToken(null);
        set({ user: null, token: null, error: null });
      },

      clearError: () => {
        set({ error: null });
      },

      setToken: (token) => {
        setApiToken(token);
        set({ token });
      },

      restoreSession: async () => {
        const { token } = get();
        if (get().user) return;
        set({ isLoading: true });
        try {
          if (!token) {
            // No access token — try a silent refresh via the HttpOnly cookie.
            const { accessToken } = await authApi.refresh();
            setApiToken(accessToken);
            set({ token: accessToken });
          }
          const user = await authApi.fetchProfile();
          set({ user, isLoading: false });
        } catch {
          // Token is invalid or expired and refresh failed — clean up silently.
          set({ token: null, user: null, isLoading: false });
        }
      },
    }),
    {
      name: 'preenfm3-auth',
      // Token is NOT persisted — it lives in memory only.
      // On page reload, restoreSession() uses the HttpOnly refresh_token cookie to get a new one.
      partialize: () => ({}),
    },
  ),
);
