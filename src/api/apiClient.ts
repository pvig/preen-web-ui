/**
 * Base HTTP client — injects Bearer token, sends credentials (HttpOnly cookies),
 * and handles 401 with automatic access-token refresh before logging out.
 */

const BASE_URL = import.meta.env.VITE_API_URL as string;

// In-memory token — set by authStore, never written to localStorage.
let _token: string | null = null;

export function setApiToken(token: string | null): void {
  _token = token;
}

function getToken(): string | null {
  return _token;
}

function logout(): void {
  import('../stores/authStore').then(({ useAuthStore }) => {
    useAuthStore.getState().logout();
  });
}

// Deduplicate concurrent refresh attempts: all callers share the same promise.
let _refreshPromise: Promise<string | null> | null = null;

async function attemptTokenRefresh(): Promise<string | null> {
  if (_refreshPromise) return _refreshPromise;

  _refreshPromise = (async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) return null;
      const data = await res.json() as { accessToken: string };
      setApiToken(data.accessToken);
      const { useAuthStore } = await import('../stores/authStore');
      useAuthStore.getState().setToken(data.accessToken);
      return data.accessToken;
    } catch {
      return null;
    } finally {
      _refreshPromise = null;
    }
  })();

  return _refreshPromise;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  isRetry = false,
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Detect slow requests (e.g. Render.com cold start). Only for the initial call, not the
  // internal retry after token refresh (which is already covered by the outer timer).
  let slowTimer: ReturnType<typeof setTimeout> | null = null;
  let isSlowRequest = false;
  if (!isRetry) {
    slowTimer = setTimeout(() => {
      isSlowRequest = true;
      import('../stores/uiStore').then(({ useUIStore }) => {
        useUIStore.getState().incrementSlowRequest();
      });
    }, 4000);
  }

  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      method,
      credentials: 'include',
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (response.status === 401 && token && !isRetry) {
      // Try to refresh the access token once using the HttpOnly refresh_token cookie.
      const newToken = await attemptTokenRefresh();
      if (newToken) {
        return await request<T>(method, path, body, true);
      }
      logout();
      const error = new Error('Session expired');
      (error as Error & { status: number }).status = 401;
      throw error;
    }

    if (!response.ok) {
      let message: string;
      try {
        const json = await response.json() as { message?: string };
        message = json.message || response.statusText || `HTTP ${response.status}`;
      } catch {
        message = await response.text().catch(() => response.statusText) || `HTTP ${response.status}`;
      }

      // Only auto-logout on 401 when a session token already exists (expired session).
      // A 401 on login/register has no token yet, so we must not clear the auth state.
      if (response.status === 401 && token) {
        logout();
      }

      const error = new Error(message);
      (error as Error & { status: number }).status = response.status;
      throw error;
    }

    // 204 No Content
    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  } finally {
    if (slowTimer !== null) {
      clearTimeout(slowTimer);
    }
    if (isSlowRequest) {
      import('../stores/uiStore').then(({ useUIStore }) => {
        useUIStore.getState().decrementSlowRequest();
      });
    }
  }
}

export const apiClient = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body: unknown) => request<T>('POST', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
};
