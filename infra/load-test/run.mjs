#!/usr/bin/env node
// Teste de carga: simula N terminais Smart 2 vendendo em paralelo no mesmo evento.
// Valida (1) throughput sob concorrência e (2) idempotência: reenvio do mesmo
// clientId não duplica a venda. Requer a API no ar e o seed aplicado.
//
// Uso:
//   API_URL=http://localhost:3000 EVENT_ID=demo-event TERMINALS=15 SALES_PER_TERMINAL=20 \
//   node infra/load-test/run.mjs

const API_URL = process.env.API_URL ?? 'http://localhost:3000';
const EVENT_ID = process.env.EVENT_ID ?? 'demo-event';
const TERMINALS = Number(process.env.TERMINALS ?? 15);
const SALES_PER_TERMINAL = Number(process.env.SALES_PER_TERMINAL ?? 20);
const EMAIL = process.env.EMAIL ?? 'admin@demo.com';
const PASSWORD = process.env.PASSWORD ?? 'senha123';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'admin123';

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

async function api(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`${res.status} ${path}: ${data?.message ?? text}`);
  return data;
}

async function ensureOpenCash(token, productId) {
  const current = await api(`/events/${EVENT_ID}/cash-registers/current`, { token });
  if (!current) {
    await api(`/events/${EVENT_ID}/cash-registers/open`, {
      method: 'POST',
      token,
      body: { openingAmount: '0' },
    });
  }
  return productId;
}

async function main() {
  console.log(`== Load test: ${TERMINALS} terminais x ${SALES_PER_TERMINAL} vendas ==`);
  const { accessToken: token } = await api('/auth/login', {
    method: 'POST',
    body: { email: EMAIL, password: PASSWORD },
  });

  const products = await api(`/events/${EVENT_ID}/products`, { token });
  if (!products.length) throw new Error('Sem produtos no evento (rode o seed).');
  const product = products[0];
  await ensureOpenCash(token, product.id);

  const before = await api(`/events/${EVENT_ID}/dashboard`, { token });

  let ok = 0;
  let fail = 0;
  let duplicateAttempts = 0;
  const start = Date.now();

  const terminal = async (t) => {
    for (let i = 0; i < SALES_PER_TERMINAL; i++) {
      const clientId = uuid();
      const body = {
        clientId,
        machineId: `terminal-${t}`,
        items: [{ productId: product.id, quantity: 1 }],
        payments: [{ method: 'DINHEIRO', amount: Number(product.price).toFixed(2) }],
      };
      try {
        await api(`/events/${EVENT_ID}/sales`, { method: 'POST', token, body });
        ok++;
        // 1 em 5: reenvia o MESMO clientId para provar idempotência.
        if (i % 5 === 0) {
          duplicateAttempts++;
          await api(`/events/${EVENT_ID}/sales`, { method: 'POST', token, body });
        }
      } catch (err) {
        fail++;
        if (fail <= 3) console.error('  falha:', err.message);
      }
    }
  };

  await Promise.all(Array.from({ length: TERMINALS }, (_, t) => terminal(t)));

  const ms = Date.now() - start;
  const after = await api(`/events/${EVENT_ID}/dashboard`, { token });
  const created = after.totalVendas - before.totalVendas;
  const expected = TERMINALS * SALES_PER_TERMINAL;

  console.log(`\nResultados:`);
  console.log(`  vendas enviadas (únicas):   ${ok}`);
  console.log(`  reenvios idempotentes:      ${duplicateAttempts}`);
  console.log(`  falhas:                     ${fail}`);
  console.log(`  vendas criadas no servidor: ${created} (esperado ${expected})`);
  console.log(`  duração:                    ${ms} ms  (~${Math.round((ok / ms) * 1000)} vendas/s)`);
  console.log(`  faturamento antes/depois:   ${before.faturamentoBruto} -> ${after.faturamentoBruto}`);

  if (created !== expected) {
    console.error(`\n❌ DUPLICAÇÃO/PERDA detectada: criadas ${created}, esperado ${expected}`);
    process.exit(1);
  }
  console.log(`\n✅ Idempotência OK: ${duplicateAttempts} reenvios não geraram duplicatas.`);
}

main().catch((e) => {
  console.error('Load test falhou:', e.message);
  process.exit(1);
});
