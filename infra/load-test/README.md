# Teste de carga (10–30 atendentes)

Simula N atendentes **distintos**, cada um com o **próprio caixa**, vendendo em
paralelo no mesmo evento. Valida **throughput** e **idempotência** (reenvio do
mesmo `clientId` não duplica).

```bash
# API no ar + seed aplicado
API_URL=http://localhost:3000 EVENT_ID=demo-event \
TERMINALS=30 SALES_PER_TERMINAL=20 \
node infra/load-test/run.mjs
```

Cada "terminal" cria um atendente (CPF gerado válido), loga por CPF, abre o
próprio caixa e vende. Saída esperada: `vendas criadas == TERMINALS*SALES_PER_TERMINAL`
e `0 duplicatas` apesar dos reenvios. Falha o processo (exit 1) se houver perda/duplicação.

> Resultado de referência (local): **30 atendentes × 20 vendas = 600 vendas, 120 reenvios
> idempotentes → 600 criadas, 0 duplicadas, 0 falhas, ~84 vendas/s**.
> Ajuste `THROTTLE_LIMIT` na API conforme o pico do evento.
