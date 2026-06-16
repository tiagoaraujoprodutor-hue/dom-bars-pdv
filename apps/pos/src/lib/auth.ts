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

export async function login(email: string, password: string, machineId: string): Promise<AuthUser> {
  const res = await api<LoginResponse>('/auth/login', {
    method: 'POST',
    body: { email, password, machineId },
  });
  await AsyncStorage.multiSet([
    ['accessToken', res.accessToken],
    ['refreshToken', res.refreshToken],
    ['user', JSON.stringify(res.user)],
  ]);
  return res.user;
}

export async function loadUser(): Promise<AuthUser | null> {
  const raw = await AsyncStorage.getItem('user');
  return raw ? (JSON.parse(raw) as AuthUser) : null;
}

export async function logout(): Promise<void> {
  await AsyncStorage.multiRemove(['accessToken', 'refreshToken', 'user']);
}
