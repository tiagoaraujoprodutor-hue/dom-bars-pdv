import { useEffect, useState } from 'react';
import * as Network from 'expo-network';
import { API_URL } from './api';

async function check(): Promise<boolean> {
  try {
    const state = await Network.getNetworkStateAsync();
    if (!state.isConnected) return false;
    // Confirma que a API responde (não basta ter wifi sem internet/servidor).
    const res = await fetch(`${API_URL}/health`, { method: 'GET' });
    return res.ok;
  } catch {
    return false;
  }
}

/** Hook que monitora conectividade real com a API a cada `intervalMs`. */
export function useOnline(intervalMs = 5000): boolean {
  const [online, setOnline] = useState(false);

  useEffect(() => {
    let active = true;
    const tick = async (): Promise<void> => {
      const ok = await check();
      if (active) setOnline(ok);
    };
    void tick();
    const timer = setInterval(() => void tick(), intervalMs);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [intervalMs]);

  return online;
}
