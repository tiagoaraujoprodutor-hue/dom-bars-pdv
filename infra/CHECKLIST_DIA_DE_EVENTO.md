# ✅ Checklist do Dia de Evento

Guia rápido para quem opera. Siga na ordem. Marque cada item.

## Véspera (com calma)
- [ ] Backup do banco feito e **restore testado** (`infra/backup/`).
- [ ] Evento criado no painel (produtos, estoque, fichas técnicas, taxa de serviço).
- [ ] Usuários cadastrados com os perfis certos (operador/supervisor/admin).
- [ ] **Senha administrativa do evento** definida e anotada em local seguro.
- [ ] Terminais Smart 2 carregados, com o app instalado e `EXPO_PUBLIC_API_URL` correto.
- [ ] Impressoras testadas (imprimir um cupom de teste em cada terminal).

## Montagem (no local)
- [ ] Rede/Wi-Fi do evento no ar; servidor (VPS) acessível (`/health` responde).
- [ ] Cada terminal faz **login** e **seleciona o evento**.
- [ ] Abrir o **caixa** (valor inicial informado).
- [ ] Fazer **1 venda de teste** por terminal → confere baixa de estoque e impressão.
- [ ] Confirmar no **dashboard** que a venda apareceu em tempo real.

## Teste do plano B (offline)
- [ ] Desligar o Wi-Fi de um terminal, fazer uma venda → deve salvar (indicador "offline", fila +1).
- [ ] Religar o Wi-Fi → a fila zera sozinha e a venda aparece no dashboard (sem duplicar).

## Durante o evento
- [ ] Acompanhar o **FATURAMENTO BRUTO** e a fila de sync de cada terminal.
- [ ] Sangrias/suprimentos sempre com **senha admin + motivo**.
- [ ] Cortesias/estornos só pelo admin, com justificativa.
- [ ] De olho nos alertas de **estoque mínimo**.

## Fechamento
- [ ] Garantir que todos os terminais estão **online** e com **fila zerada**.
- [ ] Fechar o **caixa** de cada terminal.
- [ ] **Encerrar o evento** (consolida tudo) e baixar o **relatório geral em PDF**.
- [ ] Baixar os demais relatórios necessários (vendas, pagamentos, perdas, etc.).
- [ ] Backup final do banco.

## Se algo der errado
- API fora do ar → checar VPS/containers (`docker compose ps`, `logs`). Os terminais
  continuam vendendo **offline**; sincronizam quando voltar.
- Impressora falhou → a venda é registrada mesmo assim; reimprima depois.
- Dúvida em número → todo movimento está na **auditoria** (imutável).
