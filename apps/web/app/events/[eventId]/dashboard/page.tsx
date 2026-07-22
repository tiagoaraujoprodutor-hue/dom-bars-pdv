'use client';

import { use, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { connectEvent } from '@/lib/socket';
import { Topbar } from '@/components/topbar';

interface Snapshot {
  faturamentoBruto: string;
  totalVendas: number;
  ticketMedio: string;
  porOperador: { nome: string; total: string; vendas: number }[];
  porMaquina: { machineId: string; total: string; vendas: number }[];
  porFormaPagamento: { method: string; total: string }[];
  produtosMaisVendidos: { nome: string; quantidade: number }[];
  comandas: { abertas: number; fechadas: number };
  sangrias: string;
  cortesias: { total: string; quantidade: number };
}

function brl(value: string): string {
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function DashboardPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = use(params);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [online, setOnline] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api<Snapshot>(`/events/${eventId}/dashboard`)
      .then(setSnap)
      .catch((e) => setError((e as Error).message));

    const socket = connectEvent(eventId);
    socket.on('connected', () => setOnline(true));
    socket.on('disconnect', () => setOnline(false));
    socket.on('dashboard:update', (data: Snapshot) => setSnap(data));

    return () => {
      socket.close();
    };
  }, [eventId]);

  return (
    <>
      <Topbar eventId={eventId} />
      <div className="container">
        <div className="spread">
          <h1>Dashboard</h1>
          <span className="pill">
            <span className={`dot ${online ? 'online' : 'offline'}`} />
            {online ? 'Tempo real' : 'Offline'}
          </span>
        </div>
        {error && <div className="error">{error}</div>}

        <div className="faturamento" style={{ marginTop: 16 }}>
          <div className="label">Faturamento Bruto Total</div>
          <div className="value">{snap ? brl(snap.faturamentoBruto) : '—'}</div>
        </div>

        <div className="grid grid-3" style={{ marginTop: 16 }}>
          <div className="card metric">
            <div className="k">Vendas</div>
            <div className="v">{snap?.totalVendas ?? 0}</div>
          </div>
          <div className="card metric">
            <div className="k">Ticket médio</div>
            <div className="v">{snap ? brl(snap.ticketMedio) : '—'}</div>
          </div>
          <div className="card metric">
            <div className="k">Comandas abertas / fechadas</div>
            <div className="v">
              {snap?.comandas.abertas ?? 0} / {snap?.comandas.fechadas ?? 0}
            </div>
          </div>
        </div>

        <div className="grid grid-2" style={{ marginTop: 16 }}>
          <div className="card">
            <h3>Por operador</h3>
            <table>
              <thead>
                <tr>
                  <th>Operador</th>
                  <th>Vendas</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {(snap?.porOperador ?? []).map((o) => (
                  <tr key={o.nome}>
                    <td>{o.nome}</td>
                    <td>{o.vendas}</td>
                    <td>{brl(o.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card">
            <h3>Formas de pagamento</h3>
            <div className="bars">
              {(() => {
                const rows = snap?.porFormaPagamento ?? [];
                const totalPg = rows.reduce((a, p) => a + Number(p.total), 0) || 1;
                const cor: Record<string, string> = {
                  PIX: 'var(--c-pix)',
                  CREDITO: 'var(--c-cred)',
                  DEBITO: 'var(--c-deb)',
                  DINHEIRO: 'var(--c-din)',
                  CORTESIA: 'var(--violet)',
                };
                return rows.map((p) => {
                  const pct = (Number(p.total) / totalPg) * 100;
                  const c = cor[p.method] ?? 'var(--accent)';
                  return (
                    <div className="bar-row" key={p.method}>
                      <div className="bh">
                        <span className="bn">
                          <span className="sw" style={{ background: c }} />
                          {p.method}
                        </span>
                        <span className="bv tnum">
                          {brl(p.total)}
                          <small>{pct.toFixed(0)}%</small>
                        </span>
                      </div>
                      <div className="trk">
                        <div className="fil" style={{ width: `${pct}%`, background: c }} />
                      </div>
                    </div>
                  );
                });
              })()}
              {(snap?.porFormaPagamento ?? []).length === 0 && (
                <p className="muted">Sem pagamentos ainda.</p>
              )}
            </div>
          </div>

          <div className="card">
            <h3>Produtos mais vendidos</h3>
            <div className="bars">
              {(() => {
                const rows = snap?.produtosMaisVendidos ?? [];
                const max = Math.max(1, ...rows.map((p) => p.quantidade));
                return rows.map((p) => (
                  <div className="bar-row" key={p.nome}>
                    <div className="bh">
                      <span className="bn">{p.nome}</span>
                      <span className="bv tnum">{p.quantidade}</span>
                    </div>
                    <div className="trk">
                      <div
                        className="fil"
                        style={{
                          width: `${(p.quantidade / max) * 100}%`,
                          background: 'linear-gradient(90deg,#0f5c46,#34d399)',
                        }}
                      />
                    </div>
                  </div>
                ));
              })()}
              {(snap?.produtosMaisVendidos ?? []).length === 0 && (
                <p className="muted">Sem vendas ainda.</p>
              )}
            </div>
          </div>

          <div className="card">
            <h3>Movimentações</h3>
            <p>
              Sangrias: <strong>{snap ? brl(snap.sangrias) : '—'}</strong>
            </p>
            <p>
              Cortesias: <strong>{snap ? brl(snap.cortesias.total) : '—'}</strong>{' '}
              <span className="muted">({snap?.cortesias.quantidade ?? 0})</span>
            </p>
            <p>
              Máquinas ativas: <strong>{snap?.porMaquina.length ?? 0}</strong>
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
