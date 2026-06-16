import { api } from './api';

export interface Membership {
  eventId: string;
  role: string;
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  user: { id: string; name: string; email: string; companyId: string; memberships: Membership[] };
}

export async function login(email: string, password: string): Promise<LoginResult> {
  const result = await api<LoginResult>('/auth/login', {
    method: 'POST',
    body: { email, password },
  });
  window.localStorage.setItem('accessToken', result.accessToken);
  window.localStorage.setItem('refreshToken', result.refreshToken);
  window.localStorage.setItem('user', JSON.stringify(result.user));
  return result;
}

export function logout(): void {
  window.localStorage.removeItem('accessToken');
  window.localStorage.removeItem('refreshToken');
  window.localStorage.removeItem('user');
}

export function currentUser(): LoginResult['user'] | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem('user');
  return raw ? (JSON.parse(raw) as LoginResult['user']) : null;
}
