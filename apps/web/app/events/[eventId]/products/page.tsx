'use client';

import { FormEvent, use, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Topbar } from '@/components/topbar';

interface Product {
  id: string;
  name: string;
  price: string;
  costPrice: string;
  stock: number;
  minStock: number;
  active: boolean;
}

export default function ProductsPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = use(params);
  const [products, setProducts] = useState<Product[]>([]);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [cost, setCost] = useState('');
  const [stock, setStock] = useState('0');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function reload() {
    api<Product[]>(`/events/${eventId}/products`)
      .then(setProducts)
      .catch((e) => setError((e as Error).message));
  }

  useEffect(reload, [eventId]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    setError('');
    setSaving(true);
    try {
      await api(`/events/${eventId}/products`, {
        method: 'POST',
        body: { name, price, costPrice: cost || '0', stock: Number(stock) },
      });
      setName('');
      setPrice('');
      setCost('');
      setStock('0');
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
        <h1>Produtos</h1>
        <form className="card row" onSubmit={onCreate} style={{ alignItems: 'flex-end' }}>
          <div style={{ flex: 2 }}>
            <label>Nome</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div style={{ flex: 1 }}>
            <label>Preço venda</label>
            <input value={price} onChange={(e) => setPrice(e.target.value)} required />
          </div>
          <div style={{ flex: 1 }}>
            <label>Custo compra</label>
            <input value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0.00" />
          </div>
          <div style={{ flex: 1 }}>
            <label>Estoque</label>
            <input type="number" value={stock} onChange={(e) => setStock(e.target.value)} />
          </div>
          <button type="submit" disabled={saving}>
            {saving ? 'Salvando…' : 'Adicionar'}
          </button>
        </form>
        {error && <div className="error">{error}</div>}

        <div className="card" style={{ marginTop: 16 }}>
          <table>
            <thead>
              <tr>
                <th>Produto</th>
                <th>Preço</th>
                <th>Custo</th>
                <th>Lucro un.</th>
                <th>Estoque</th>
                <th>Mínimo</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const lucro = Number(p.price) - Number(p.costPrice ?? 0);
                return (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{Number(p.price).toFixed(2)}</td>
                  <td>{Number(p.costPrice ?? 0).toFixed(2)}</td>
                  <td style={{ color: lucro >= 0 ? 'var(--accent)' : 'var(--danger)' }}>
                    {lucro.toFixed(2)}
                  </td>
                  <td style={{ color: p.stock <= p.minStock ? 'var(--danger)' : undefined }}>
                    {p.stock}
                  </td>
                  <td>{p.minStock}</td>
                  <td>{p.active ? 'Ativo' : 'Inativo'}</td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
