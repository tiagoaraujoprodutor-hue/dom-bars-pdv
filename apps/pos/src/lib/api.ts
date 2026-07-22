import AsyncStorage from '@react-native-async-storage/async-storage';

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:3000';

export async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem('accessToken');
}

export interface ApiOptions {
  method?: string;
  body?: unknown;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

function doFetch(path: string, options: ApiOptions, token: string | null): Promise<Response> {
  return fetch(`${API_URL}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
}

/**
 * Renova o access token usando o refresh token guardado. Retorna o novo token
 * ou null se não der (aí a sessão realmente acabou). Rotativo: guarda o novo par.
 */
export async function tryRefresh(): Promise<string | null> {
  const refreshToken = await AsyncStorage.getItem('refreshToken');
  if (!refreshToken) return null;
  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { accessToken: string; refreshToken: string };
    await Promise.all([
      AsyncStorage.setItem('accessToken', data.accessToken),
      AsyncStorage.setItem('refreshToken', data.refreshToken),
    ]);
    return data.accessToken;
  } catch {
    return null;
  }
}

export async function api<T = unknown>(path: string, options: ApiOptions = {}): Promise<T> {
  let res = await doFetch(path, options, await getToken());

  // Token expirado (401): tenta renovar automaticamente e refazer 1 vez, para a
  // atendente nunca ser deslogada no meio da operação.
  if (res.status === 401) {
    const renewed = await tryRefresh();
    if (renewed) res = await doFetch(path, options, renewed);
  }

  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { message?: string | string[] };
    const message = Array.isArray(data.message)
      ? data.message.join(', ')
      : (data.message ?? `Erro ${res.status}`);
    throw new ApiError(message, res.status);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
