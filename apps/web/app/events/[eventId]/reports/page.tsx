'use client';

import { FormEvent, use, useState } from 'react';
import { api, openPdf } from '@/lib/api';
import { maskCpf } from '@/lib/cpf';
import { Topbar } from '@/components/topbar';

interface AttendantClosing {
  userId: string;
  name: string;
  cpf: string | null;
  vendas: number;
  total: string;
  porFormaPagamento: { method: string; total: string }[];
  caixaInicial: string;
  suprimentos: string;
  sangrias: string;
  vendasDinheiro: string;
  caixaEsperado: string;
}

function brl(v: string): string {
  return `R$ ${Number(v).toFixed(2)}`;
}

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
  const [cpf, setCpf] = useState('');
  const [closing, setClosing] = useState<AttendantClosing[] | null>(null);

  async function download(path: string) {
    setError('');
    try {
      await openPdf(`/events/${eventId}/reports/${path}`);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function searchClosing(e?: FormEvent) {
    e?.preventDefault();
    setError('');
    try {
      const query = cpf ? `?cpf=${encodeURIComponent(cpf)}` : '';
      const data = await api<AttendantClosing[]>(`/events/${eventId}/attendants/closing${query}`);
      setClosing(data);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function closeAllCash() {
    setError('');
    setCloseResult('');
    try {
      const r = await api<{ closed: number }>(`/events/${eventId}/cash-registers/close-all`, {
        method: 'POST',
        body: { adminPassword },
      });
      setCloseResult(`${r.closed} caixa(s) fechado(s).`);
    } catch (err) {
      setError((err as Error).message);
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
          <h3>Fechamento por atendente</h3>
          <p className="muted">Busque pelo CPF (ou liste todos) para conferir e imprimir o fechamento de cada atendente.</p>
          <form className="row" onSubmit={searchClosing} style={{ alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <label>CPF</label>
              <input
                value={cpf}
                onChange={(e) => setCpf(maskCpf(e.target.value))}
                placeholder="000.000.000-00"
                inputMode="numeric"
              />
            </div>
            <button type="submit">Buscar</button>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setCpf('');
                setClosing(null);
                void api<AttendantClosing[]>(`/events/${eventId}/attendants/closing`)
                  .then(setClosing)
                  .catch((err) => setError((err as Error).message));
              }}
            >
              Listar todos
            </button>
          </form>

          {closing && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ marginTop: 12, minWidth: 900 }}>
                <thead>
                  <tr>
                    <th>Atendente</th>
                    <th>CPF</th>
                    <th>Vendas</th>
                    <th>Total</th>
                    <th>Caixa inicial</th>
                    <th>Dinheiro</th>
                    <th>Sangrias</th>
                    <th>Caixa esperado</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {closing.map((a) => (
                    <tr key={a.userId}>
                      <td>{a.name}</td>
                      <td>{a.cpf ? maskCpf(a.cpf) : '—'}</td>
                      <td>{a.vendas}</td>
                      <td>{brl(a.total)}</td>
                      <td>{brl(a.caixaInicial)}</td>
                      <td>{brl(a.vendasDinheiro)}</td>
                      <td style={{ color: 'var(--danger)' }}>-{brl(a.sangrias)}</td>
                      <td style={{ color: 'var(--accent)', fontWeight: 700 }}>{brl(a.caixaEsperado)}</td>
                      <td>
                        <button className="secondary" onClick={() => download(`attendant/${a.userId}`)}>
                          PDF
                        </button>
                      </td>
                    </tr>
                  ))}
                  {closing.length === 0 && (
                    <tr>
                      <td colSpan={9} className="muted">
                        Nenhum atendente encontrado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
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
            <button type="button" className="secondary" onClick={closeAllCash}>
              Fechar todos os caixas
            </button>
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
