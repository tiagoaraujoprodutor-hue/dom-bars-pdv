'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { login } from '@/lib/auth';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('admin@demo.com');
  const [password, setPassword] = useState('senha123');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      router.push('/events');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth">
      <div className="box">
        <div className="brandrow">
          <span className="logo">
            <svg viewBox="0 0 24 24" width={24} height={24} fill="none" stroke="#04231a" strokeWidth={2.2} strokeLinejoin="round">
              <path d="M5 3h14l-1 7a6 6 0 0 1-12 0L5 3Z" />
              <path d="M12 16v5M8 21h8" strokeLinecap="round" />
            </svg>
          </span>
        </div>
        <h1>PDV Eventos &amp; Bares</h1>
        <p className="sub">Entre para acessar o painel.</p>
        <form className="card" onSubmit={onSubmit}>
          <label htmlFor="email">E-mail</label>
          <input id="email" value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
          <label htmlFor="password">Senha</label>
          <input
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
          />
          <div style={{ marginTop: 18 }}>
            <button type="submit" disabled={loading} style={{ width: '100%' }}>
              {loading ? 'Entrando…' : 'Entrar'}
            </button>
          </div>
          {error && <div className="error">{error}</div>}
        </form>
      </div>
    </div>
  );
}
