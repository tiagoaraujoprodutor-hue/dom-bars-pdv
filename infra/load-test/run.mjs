#!/usr/bin/env node
// Teste de carga realista: N atendentes distintos, cada um com o PRÓPRIO caixa,
// vendendo em paralelo no mesmo evento. Valida throughput e idempotência
// (reenvio do mesmo clientId não duplica). Requer API no ar + seed aplicado.
//
// Uso:
//   API_URL=http://localhost:3000 EVENT_ID=demo-event TERMINALS=30 SALES_PER_TERMINAL=20 \
//   node infra/load-test/run.mjs

const API_URL = process.env.API_URL ?? 'http://localhost:3000';
const EVENT_ID = process.env.EVENT_ID ?? 'demo-event';
const TERMINALS = Number(process.env.TERMINALS ?? 30);
const SALES_PER_TERMINAL = Number(process.env.SALES_PER_TERMINAL ?? 20);
const ADMIN_EMAIL = process.env.EMAIL ?? 'admin@demo.com';
const ADMIN_PASSWORD_LOGIN = process.env.PASSWORD ?? 'senha123';

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// Gera um CPF válido (com dígitos verificadores).
function genCpf() {
  const n = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  const dv = (arr) => {
    let s = 0;
    for (let i = 0; i < arr.length; i++) s += arr[i] * (arr.length + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  const d1 = dv(n);
  const d2 = dv([...n, d1]);
  return [...n, d1, d2].join('');
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

async function main() {
  console.log(`== Load test: ${TERMINALS} atendentes x ${SALES_PER_TERMINAL} vendas (caixa por atendente) ==`);
  const { accessToken: adminToken } = await api('/auth/login', {
    method: 'POST',
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD_LOGIN },
  });

  const products = await api(`/events/${EVENT_ID}/products`, { token: adminToken });
  if (!products.length) throw new Error('Sem produtos no evento (rode o seed).');
  const product = products[0];

  // Cria N atendentes e prepara cada terminal (login por CPF + abre o próprio caixa).
  console.log('Preparando atendentes e caixas...');
  const terminals = await Promise.all(
    Array.from({ length: TERMINALS }, async (_, i) => {
      const cpf = genCpf();
      await api(`/events/${EVENT_ID}/attendants`, {
        method: 'POST',
        token: adminToken,
        body: { name: `Atendente ${i}`, cpf, password: 'atende1', role: 'OPERADOR' },
      });
      const { accessToken } = await api('/auth/login', {
        method: 'POST',
        body: { cpf, password: 'atende1' },
      });
      await api(`/events/${EVENT_ID}/cash-registers/open`, {
        method: 'POST',
        token: accessToken,
        body: { openingAmount: '50' },
      });
      return { token: accessToken, machineId: `terminal-${i}` };
    }),
  );

  const before = await api(`/events/${EVENT_ID}/dashboard`, { token: adminToken });

  let ok = 0;
  let fail = 0;
  let dup = 0;
  const start = Date.now();

  const sell = async (t) => {
    for (let i = 0; i < SALES_PER_TERMINAL; i++) {
      const clientId = uuid();
      const body = {
        clientId,
        machineId: t.machineId,
        items: [{ productId: product.id, quantity: 1 }],
        payments: [{ method: 'DINHEIRO', amount: Number(product.price).toFixed(2) }],
      };
      try {
        await api(`/events/${EVENT_ID}/sales`, { method: 'POST', token: t.token, body });
        ok++;
        if (i % 5 === 0) {
          dup++;
          await api(`/events/${EVENT_ID}/sales`, { method: 'POST', token: t.token, body });
        }
      } catch (err) {
        fail++;
        if (fail <= 3) console.error('  falha:', err.message);
      }
    }
  };

  await Promise.all(terminals.map((t) => sell(t)));

  const ms = Date.now() - start;
  const after = await api(`/events/${EVENT_ID}/dashboard`, { token: adminToken });
  const created = after.totalVendas - before.totalVendas;
  const expected = TERMINALS * SALES_PER_TERMINAL;

  console.log(`\nResultados:`);
  console.log(`  atendentes/terminais:       ${TERMINALS}`);
  console.log(`  vendas únicas enviadas:     ${ok}`);
  console.log(`  reenvios idempotentes:      ${dup}`);
  console.log(`  falhas:                     ${fail}`);
  console.log(`  vendas criadas no servidor: ${created} (esperado ${expected})`);
  console.log(`  duração das vendas:         ${ms} ms  (~${Math.round((ok / ms) * 1000)} vendas/s)`);
  console.log(`  faturamento:                ${before.faturamentoBruto} -> ${after.faturamentoBruto}`);

  if (created !== expected) {
    console.error(`\n❌ DUPLICAÇÃO/PERDA: criadas ${created}, esperado ${expected}`);
    process.exit(1);
  }
  console.log(`\n✅ ${TERMINALS} caixas simultâneos, ${dup} reenvios, zero duplicatas.`);
}

main().catch((e) => {
  console.error('Load test falhou:', e.message);
  process.exit(1);
});
