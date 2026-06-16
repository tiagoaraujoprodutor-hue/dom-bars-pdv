import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AdminPasswordService } from '../auth/admin-password.service';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { CloseEventDto } from './close-event.dto';

/**
 * Fechamento automático do evento (PLAN §6.15): consolida vendas, perdas e caixa,
 * marca o evento como ENCERRADO e registra auditoria. O relatório geral em PDF fica
 * disponível em GET /events/:id/reports/general.
 */
@Injectable()
export class CloseEventService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly adminPassword: AdminPasswordService,
  ) {}

  async close(eventId: string, userId: string, companyId: string, dto: CloseEventDto) {
    await this.adminPassword.assertValid(eventId, dto.adminPassword);

    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Evento não encontrado');
    if (event.status === 'ENCERRADO') {
      throw new ConflictException('Evento já está encerrado');
    }

    const [vendas, perdas, comandasAbertas, caixasAbertos] = await Promise.all([
      this.prisma.sale.aggregate({
        where: { eventId, status: 'CONCLUIDA' },
        _sum: { total: true },
        _count: true,
      }),
      this.prisma.lossRecord.count({ where: { eventId } }),
      this.prisma.tab.count({ where: { eventId, status: 'ABERTA' } }),
      this.prisma.cashRegister.count({ where: { eventId, status: 'ABERTO' } }),
    ]);

    const closed = await this.prisma.event.update({
      where: { id: eventId },
      data: { status: 'ENCERRADO', endsAt: new Date() },
      select: { id: true, name: true, status: true, endsAt: true },
    });

    const consolidacao = {
      faturamentoBruto: (vendas._sum.total ?? 0).toString(),
      totalVendas: vendas._count,
      perdas,
      comandasAbertasNoFechamento: comandasAbertas,
      caixasAbertosNoFechamento: caixasAbertos,
    };

    await this.audit.record({
      action: 'EVENT_CLOSE',
      userId,
      companyId,
      eventId,
      entity: 'Event',
      entityId: eventId,
      metadata: consolidacao,
    });

    return {
      evento: closed,
      consolidacao,
      relatorioGeral: `/events/${eventId}/reports/general`,
    };
  }
}
