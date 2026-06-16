'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Topbar } from '@/components/topbar';

interface ProductDraft {
  name: string;
  price: string;
  stock: number;
}

export default function NewEventPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [serviceFeeEnabled, setServiceFeeEnabled] = useState(false);
  const [serviceFeePercent, setServiceFeePercent] = useState('10');
  const [products, setProducts] = useState<ProductDraft[]>([{ name: '', price: '', stock: 0 }]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function updateProduct(i: number, patch: Partial<ProductDraft>) {
    setProducts((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const created = await api<{ id: string }>('/events', {
        method: 'POST',
        body: {
          name,
          adminPassword,
          serviceFeeEnabled,
          serviceFeePercent,
          products: products
            .filter((p) => p.name && p.price)
            .map((p) => ({ name: p.name, price: p.price, stock: Number(p.stock) || 0 })),
        },
      });
      router.push(`/events/${created.id}/dashboard`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Topbar />
      <div className="container" style={{ maxWidth: 720 }}>
        <h1>Novo evento</h1>
        <p className="muted">Configure o essencial para começar a vender.</p>
        <form className="card" onSubmit={onSubmit}>
          <label>Nome do evento</label>
          <input value={name} onChange={(e) => setName(e.target.value)} required />

          <label>Senha administrativa do evento</label>
          <input
            type="password"
            value={adminPassword}
            onChange={(e) => setAdminPassword(e.target.value)}
            required
          />

          <div className="row" style={{ marginTop: 12 }}>
            <label className="row" style={{ margin: 0 }}>
              <input
                type="checkbox"
                style={{ width: 'auto' }}
                checked={serviceFeeEnabled}
                onChange={(e) => setServiceFeeEnabled(e.target.checked)}
              />
              <span>Cobrar taxa de serviço</span>
            </label>
            {serviceFeeEnabled && (
              <div style={{ width: 120 }}>
                <input
                  type="number"
                  value={serviceFeePercent}
                  onChange={(e) => setServiceFeePercent(e.target.value)}
                />
              </div>
            )}
          </div>

          <h3 style={{ marginTop: 20 }}>Produtos iniciais</h3>
          {products.map((p, i) => (
            <div className="row" key={i}>
              <input
                placeholder="Nome"
                value={p.name}
                onChange={(e) => updateProduct(i, { name: e.target.value })}
                style={{ flex: 2 }}
              />
              <input
                placeholder="Preço"
                value={p.price}
                onChange={(e) => updateProduct(i, { price: e.target.value })}
                style={{ flex: 1 }}
              />
              <input
                placeholder="Estoque"
                type="number"
                value={p.stock}
                onChange={(e) => updateProduct(i, { stock: Number(e.target.value) })}
                style={{ flex: 1 }}
              />
            </div>
          ))}
          <button
            type="button"
            className="secondary"
            style={{ marginTop: 8 }}
            onClick={() => setProducts((p) => [...p, { name: '', price: '', stock: 0 }])}
          >
            + Adicionar produto
          </button>

          <div style={{ marginTop: 20 }}>
            <button type="submit" disabled={saving}>
              {saving ? 'Criando…' : 'Criar evento'}
            </button>
          </div>
          {error && <div className="error">{error}</div>}
        </form>
      </div>
    </>
  );
}
