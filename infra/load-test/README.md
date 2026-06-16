# Teste de carga (15 terminais)

Simula 15 terminais Smart 2 vendendo em paralelo no mesmo evento e valida a
**idempotência** (reenvio do mesmo `clientId` não duplica) e o throughput.

```bash
# API no ar + seed aplicado
API_URL=http://localhost:3000 EVENT_ID=demo-event \
TERMINALS=15 SALES_PER_TERMINAL=20 \
node infra/load-test/run.mjs
```

Saída esperada: `vendas criadas == TERMINALS*SALES_PER_TERMINAL` e
`0 duplicatas` apesar dos reenvios. Falha o processo (exit 1) se houver
perda/duplicação.

> Resultado de referência (1 VPS modesto, local): 300 vendas de 15 terminais com
> 60 reenvios idempotentes → 300 criadas, 0 duplicadas, ~77 vendas/s.
> Ajuste `THROTTLE_LIMIT` na API conforme o volume do evento.
