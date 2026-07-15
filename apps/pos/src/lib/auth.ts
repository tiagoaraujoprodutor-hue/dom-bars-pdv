import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from './api';

export interface Membership {
  eventId: string;
  role: string;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  companyId: string;
  memberships: Membership[];
}

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

/**
 * Login por CPF (atendente) ou e-mail (admin/supervisor). Detecta pelo formato:
 * se tiver '@' é e-mail; senão trata como CPF (só dígitos).
 */
export async function login(identifier: string, password: string, machineId: string): Promise<AuthUser> {
  const isEmail = identifier.includes('@');
  const body = isEmail
    ? { email: identifier.trim(), password, machineId }
    : { cpf: identifier.replace(/\D/g, ''), password, machineId };
  const res = await api<LoginResponse>('/auth/login', { method: 'POST', body });
  // AsyncStorage 3.x não tem mais multiSet — usa setItem individual.
  await Promise.all([
    AsyncStorage.setItem('accessToken', res.accessToken),
    AsyncStorage.setItem('refreshToken', res.refreshToken),
    AsyncStorage.setItem('user', JSON.stringify(res.user)),
  ]);
  return res.user;
}

export async function loadUser(): Promise<AuthUser | null> {
  const raw = await AsyncStorage.getItem('user');
  return raw ? (JSON.parse(raw) as AuthUser) : null;
}

export async function logout(): Promise<void> {
  // AsyncStorage 3.x não tem mais multiRemove — usa removeItem individual.
  await Promise.all([
    AsyncStorage.removeItem('accessToken'),
    AsyncStorage.removeItem('refreshToken'),
    AsyncStorage.removeItem('user'),
  ]);
}
