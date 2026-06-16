import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { dec } from '../common/money';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/auth.types';
import { SalesService } from '../sales/sales.service';
import { AddTabItemsDto, CloseTabDto, CreateTabDto } from './dto/tabs.dto';

@Injectable()
export class TabsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sales: SalesService,
    private readonly audit: AuditService,
  ) {}

  async create(eventId: string, userId: string, companyId: string, dto: CreateTabDto) {
    const code = dto.code ?? randomUUID();
    const exists = await this.prisma.tab.findUnique({
      where: { eventId_code: { eventId, code } },
    });
    if (exists) {
      throw new ConflictException('Já existe comanda com este código');
    }
    const tab = await this.prisma.tab.create({ data: { eventId, code } });
    await this.audit.record({
      action: 'TAB_OPEN',
      userId,
      companyId,
      eventId,
      entity: 'Tab',
      entityId: tab.id,
      metadata: { code },
    });
    return tab;
  }

  async getByCode(eventId: string, code: string) {
    const tab = await this.prisma.tab.findUnique({
      where: { eventId_code: { eventId, code } },
      include: { items: { include: { product: true } }, sales: true },
    });
    if (!tab) throw new NotFoundException('Comanda não encontrada');
    return tab;
  }

  private async requireOpenTab(eventId: string, tabId: string) {
    const tab = await this.prisma.tab.findFirst({
      where: { id: tabId, eventId },
      include: { items: true },
    });
    if (!tab) throw new NotFoundException('Comanda não encontrada');
    if (tab.status !== 'ABERTA') {
      throw new ConflictException('Comanda não está aberta');
    }
    return tab;
  }

  async addItems(eventId: string, tabId: string, dto: AddTabItemsDto) {
    await this.requireOpenTab(eventId, tabId);

    const productIds = dto.items.map((i) => i.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds }, eventId, active: true },
    });
    const byId = new Map(products.map((p) => [p.id, p]));

    for (const item of dto.items) {
      const product = byId.get(item.productId);
      if (!product) {
        throw new BadRequestException(`Produto inválido para o evento: ${item.productId}`);
      }
      await this.prisma.tabItem.create({
        data: {
          tabId,
          productId: product.id,
          quantity: item.quantity,
          unitPrice: dec(product.price),
        },
      });
    }

    return this.prisma.tab.findUniqueOrThrow({
      where: { id: tabId },
      include: { items: { include: { product: true } } },
    });
  }

  /** Fecha a comanda gerando a venda (com taxa de serviço, se habilitada no evento). */
  async close(eventId: string, tabId: string, user: AuthUser, dto: CloseTabDto) {
    const tab = await this.requireOpenTab(eventId, tabId);
    if (tab.items.length === 0) {
      throw new BadRequestException('Comanda sem itens não pode ser fechada');
    }

    return this.sales.finalize({
      eventId,
      companyId: user.companyId,
      operatorId: user.userId,
      clientId: dto.clientId,
      machineId: dto.machineId,
      tabId,
      lines: tab.items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
      payments: dto.payments,
      applyServiceFee: true,
    });
  }
}
