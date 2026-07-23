export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem('accessToken');
}

export interface ApiOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

/** Renova o access token com o refresh token guardado. Rotativo: salva o novo par. */
async function tryRefresh(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  const refreshToken = window.localStorage.getItem('refreshToken');
  if (!refreshToken) return null;
  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { accessToken: string; refreshToken: string };
    window.localStorage.setItem('accessToken', data.accessToken);
    window.localStorage.setItem('refreshToken', data.refreshToken);
    return data.accessToken;
  } catch {
    return null;
  }
}

/** Sessão realmente acabou: limpa e manda pro login (sem erro solto na tela). */
function forceLogin(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem('accessToken');
  window.localStorage.removeItem('refreshToken');
  window.localStorage.removeItem('user');
  if (!window.location.pathname.startsWith('/login')) {
    window.location.href = '/login';
  }
}

function doFetch(path: string, options: ApiOptions, token: string | null): Promise<Response> {
  return fetch(`${API_URL}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
}

export class SessionExpiredError extends Error {
  constructor() {
    super('Sessão expirada. Faça login novamente.');
  }
}

export async function api<T = unknown>(path: string, options: ApiOptions = {}): Promise<T> {
  let res = await doFetch(path, options, getToken());

  // Token expirado (401): renova automaticamente e refaz 1 vez. Se não der,
  // manda pro login — nunca deixa "Unauthorized" solto na operação.
  if (res.status === 401) {
    const renewed = await tryRefresh();
    if (renewed) {
      res = await doFetch(path, options, renewed);
    } else {
      forceLogin();
      throw new SessionExpiredError();
    }
  }

  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { message?: string | string[] };
    const message = Array.isArray(data.message)
      ? data.message.join(', ')
      : (data.message ?? `Erro ${res.status}`);
    throw new Error(message);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Baixa um PDF autenticado e abre em nova aba (com renovação de sessão). */
export async function openPdf(path: string): Promise<void> {
  const fetchPdf = (token: string | null): Promise<Response> =>
    fetch(`${API_URL}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });

  let res = await fetchPdf(getToken());
  if (res.status === 401) {
    const renewed = await tryRefresh();
    if (renewed) {
      res = await fetchPdf(renewed);
    } else {
      forceLogin();
      throw new SessionExpiredError();
    }
  }
  if (!res.ok) throw new Error(`Erro ${res.status} ao gerar relatório`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
