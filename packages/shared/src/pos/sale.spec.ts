import { buildProductionTicket, buildReceipt } from './sale';

describe('buildReceipt', () => {
  it('monta cupom com itens, taxa e total', () => {
    const job = buildReceipt({
      eventName: 'Festa Demo',
      saleId: 'sale-1',
      items: [{ name: 'Caipirinha', quantity: 2, unitPrice: '18.00' }],
      subtotal: '36.00',
      serviceFee: '3.60',
      total: '39.60',
      payments: [{ method: 'PIX', amount: '39.60' }],
      attendant: 'Maria',
      dateTime: '15/07/2026 22:30',
    });

    expect(job.kind).toBe('receipt');
    // Nome do evento vai no cabeçalho em DESTAQUE (não em linha comum de corpo).
    expect(job.header).toBe('Festa Demo');
    expect(job.lines).not.toContain('Festa Demo');
    expect(job.lines).toContain('2x Caipirinha');
    expect(job.lines).toContain('Taxa de servico: R$ 3.60');
    expect(job.lines).toContain('TOTAL: R$ 39.60');
    expect(job.lines.some((l) => l.includes('PIX'))).toBe(true);
    expect(job.lines).toContain('Atendente: Maria');
    expect(job.lines).toContain('15/07/2026 22:30');
  });

  it('omite a taxa de serviço quando zero', () => {
    const job = buildReceipt({
      eventName: 'Festa',
      saleId: 's',
      items: [{ name: 'Água', quantity: 1, unitPrice: '5.00' }],
      subtotal: '5.00',
      serviceFee: '0',
      total: '5.00',
      payments: [{ method: 'DINHEIRO', amount: '5.00' }],
    });
    expect(job.lines.some((l) => l.startsWith('Taxa de servico'))).toBe(false);
  });

  it('ficha de produção não expõe valores', () => {
    const job = buildProductionTicket(
      'Festa',
      [{ name: 'Caipirinha', quantity: 3, unitPrice: '18.00' }],
      { attendant: 'Maria', dateTime: '15/07/2026 22:30' },
    );
    expect(job.kind).toBe('production');
    expect(job.header).toBe('Festa');
    expect(job.lines).toContain('3x Caipirinha');
    expect(job.lines).toContain('Atendente: Maria');
    expect(job.lines.some((l) => l.includes('R$'))).toBe(false);
  });
});
