'use client';

import { FormEvent, use, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Topbar } from '@/components/topbar';

interface Membership {
  role: string;
  user: { id: string; name: string; email: string; active: boolean };
}

export default function UsersPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = use(params);
  const [members, setMembers] = useState<Membership[]>([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('OPERADOR');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function reload() {
    api<Membership[]>(`/events/${eventId}/users`)
      .then(setMembers)
      .catch((e) => setError((e as Error).message));
  }

  useEffect(reload, [eventId]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    setError('');
    setSaving(true);
    try {
      await api(`/events/${eventId}/users`, {
        method: 'POST',
        body: { name, email, password, role },
      });
      setName('');
      setEmail('');
      setPassword('');
      reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Topbar eventId={eventId} />
      <div className="container">
        <h1>Usuários do evento</h1>
        <form className="card row" onSubmit={onCreate} style={{ alignItems: 'flex-end' }}>
          <div style={{ flex: 2 }}>
            <label>Nome</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div style={{ flex: 2 }}>
            <label>E-mail</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div style={{ flex: 1 }}>
            <label>Senha</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <div style={{ flex: 1 }}>
            <label>Perfil</label>
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="OPERADOR">Operador</option>
              <option value="SUPERVISOR">Supervisor</option>
              <option value="ADMINISTRADOR">Administrador</option>
            </select>
          </div>
          <button type="submit" disabled={saving}>
            {saving ? 'Salvando…' : 'Cadastrar'}
          </button>
        </form>
        {error && <div className="error">{error}</div>}

        <div className="card" style={{ marginTop: 16 }}>
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>E-mail</th>
                <th>Perfil</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.user.id}>
                  <td>{m.user.name}</td>
                  <td>{m.user.email}</td>
                  <td>
                    <span className="pill">{m.role}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
