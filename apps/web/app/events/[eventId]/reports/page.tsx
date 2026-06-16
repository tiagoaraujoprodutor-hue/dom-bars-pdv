'use client';

import { FormEvent, use, useState } from 'react';
import { api, openPdf } from '@/lib/api';
import { Topbar } from '@/components/topbar';

const REPORTS: { path: string; label: string }[] = [
  { path: 'general', label: 'Relatório geral' },
  { path: 'sales-by-operator', label: 'Vendas por operador' },
  { path: 'sales-by-machine', label: 'Vendas por máquina' },
  { path: 'sales-by-product', label: 'Vendas por produto' },
  { path: 'payments', label: 'Formas de pagamento' },
  { path: 'courtesies', label: 'Cortesias' },
  { path: 'refunds', label: 'Reembolsos' },
  { path: 'cash-movements', label: 'Sangrias / Suprimentos' },
  { path: 'losses', label: 'Perdas' },
  { path: 'stock', label: 'Estoque' },
];

export default function ReportsPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = use(params);
  const [error, setError] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [closeResult, setCloseResult] = useState('');

  async function download(path: string) {
    setError('');
    try {
      await openPdf(`/events/${eventId}/reports/${path}`);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function closeEvent(e: FormEvent) {
    e.preventDefault();
    setError('');
    setCloseResult('');
    try {
      const res = await api<{ consolidacao: { faturamentoBruto: string; totalVendas: number } }>(
        `/events/${eventId}/close`,
        { method: 'POST', body: { adminPassword } },
      );
      setCloseResult(
        `Evento encerrado. Faturamento R$ ${res.consolidacao.faturamentoBruto} em ${res.consolidacao.totalVendas} vendas.`,
      );
      setAdminPassword('');
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <>
      <Topbar eventId={eventId} />
      <div className="container">
        <h1>Relatórios</h1>
        {error && <div className="error">{error}</div>}
        <div className="card grid grid-2">
          {REPORTS.map((r) => (
            <button key={r.path} className="secondary" onClick={() => download(r.path)}>
              ⬇ {r.label}
            </button>
          ))}
        </div>

        <div className="card" style={{ marginTop: 16 }}>
          <h3>Fechamento do evento</h3>
          <p className="muted">
            Consolida vendas, estoque, perdas e caixa, e disponibiliza o relatório geral.
            Exige a senha administrativa do evento.
          </p>
          <form className="row" onSubmit={closeEvent} style={{ alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <label>Senha administrativa</label>
              <input
                type="password"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                required
              />
            </div>
            <button type="submit">Encerrar evento</button>
            <button type="button" className="secondary" onClick={() => download('general')}>
              Ver relatório geral
            </button>
          </form>
          {closeResult && <div style={{ color: 'var(--accent)', marginTop: 8 }}>{closeResult}</div>}
        </div>
      </div>
    </>
  );
}
