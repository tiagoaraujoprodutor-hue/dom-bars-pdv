'use client';

import { FormEvent, use, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Topbar } from '@/components/topbar';

interface Attendant {
  userId: string;
  name: string;
  cpf: string;
  role: string;
  active: boolean;
  expiresAt: string | null;
  status: 'ATIVO' | 'EXPIRADO' | 'DESATIVADO';
}

function statusColor(s: Attendant['status']): string {
  if (s === 'ATIVO') return 'var(--accent)';
  if (s === 'EXPIRADO') return '#fbbf24';
  return 'var(--danger)';
}

function toIso(local: string): string | undefined {
  return local ? new Date(local).toISOString() : undefined;
}

export default function AttendantsPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = use(params);
  const [list, setList] = useState<Attendant[]>([]);
  const [error, setError] = useState('');

  const [name, setName] = useState('');
  const [cpf, setCpf] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('OPERADOR');
  const [expiresAt, setExpiresAt] = useState('');

  function reload() {
    api<Attendant[]>(`/events/${eventId}/attendants`)
      .then(setList)
      .catch((e) => setError((e as Error).message));
  }

  useEffect(reload, [eventId]);

  async function create(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await api(`/events/${eventId}/attendants`, {
        method: 'POST',
        body: { name, cpf, password, role, expiresAt: toIso(expiresAt) },
      });
      setName('');
      setCpf('');
      setPassword('');
      setExpiresAt('');
      reload();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function patch(userId: string, body: Record<string, unknown>) {
    setError('');
    try {
      await api(`/events/${eventId}/attendants/${userId}`, { method: 'PATCH', body });
      reload();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <>
      <Topbar eventId={eventId} />
      <div className="container">
        <h1>Atendentes</h1>
        <p className="muted">
          Login por CPF, com senha válida só para este evento. Se a máquina descarregar, a
          atendente entra o próprio login em outra máquina carregada.
        </p>

        <form className="card row" onSubmit={create} style={{ alignItems: 'flex-end' }}>
          <div style={{ flex: 2 }}>
            <label>Nome</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div style={{ flex: 1 }}>
            <label>CPF</label>
            <input value={cpf} onChange={(e) => setCpf(e.target.value)} placeholder="000.000.000-00" required />
          </div>
          <div style={{ flex: 1 }}>
            <label>Senha</label>
            <input value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <div style={{ flex: 1 }}>
            <label>Perfil</label>
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="OPERADOR">Operador</option>
              <option value="SUPERVISOR">Supervisor</option>
              <option value="ADMINISTRADOR">Administrador</option>
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label>Validade (opcional)</label>
            <input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
          </div>
          <button type="submit">Cadastrar</button>
        </form>
        {error && <div className="error">{error}</div>}

        <div className="card" style={{ marginTop: 16 }}>
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>CPF</th>
                <th>Perfil</th>
                <th>Validade</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {list.map((a) => (
                <tr key={a.userId}>
                  <td>{a.name}</td>
                  <td>{a.cpf}</td>
                  <td>{a.role}</td>
                  <td>{a.expiresAt ? new Date(a.expiresAt).toLocaleString('pt-BR') : '—'}</td>
                  <td>
                    <span className="pill" style={{ color: statusColor(a.status) }}>
                      {a.status}
                    </span>
                  </td>
                  <td>
                    <div className="row" style={{ gap: 6 }}>
                      <button
                        className="secondary"
                        onClick={() => patch(a.userId, { active: !a.active })}
                      >
                        {a.active ? 'Desativar' : 'Ativar'}
                      </button>
                      <button
                        className="secondary"
                        onClick={() => {
                          const nova = window.prompt(`Nova senha para ${a.name}:`);
                          if (nova) patch(a.userId, { password: nova });
                        }}
                      >
                        Redefinir senha
                      </button>
                      <button
                        className="secondary"
                        onClick={() => {
                          const d = window.prompt(
                            'Validade (AAAA-MM-DD HH:MM) — vazio remove a validade:',
                            '',
                          );
                          if (d === null) return;
                          patch(a.userId, { expiresAt: d ? new Date(d).toISOString() : null });
                        }}
                      >
                        Validade
                      </button>
                    </div>
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
