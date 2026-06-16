import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { dec } from '../common/money';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLossDto } from './losses.dto';

@Injectable()
export class LossesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(eventId: string) {
    return this.prisma.lossRecord.findMany({
      where: { eventId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async register(eventId: string, userId: string, companyId: string, dto: CreateLossDto) {
    const quantity = dec(dto.quantity);
    if (quantity.lessThanOrEqualTo(0)) {
      throw new BadRequestException('Quantidade deve ser maior que zero');
    }

    const loss = await this.prisma.$transaction(async (tx) => {
      if (dto.productId) {
        const product = await tx.product.findFirst({
          where: { id: dto.productId, eventId },
        });
        if (!product) throw new NotFoundException('Produto não encontrado');
        const qty = quantity.toNumber();
        if (product.stock < qty) {
          throw new BadRequestException('Perda maior que o estoque disponível');
        }
        await tx.product.update({
          where: { id: product.id },
          data: { stock: { decrement: Math.trunc(qty) } },
        });
      } else {
        const ingredient = await tx.ingredient.findFirst({
          where: { id: dto.ingredientId, eventId },
        });
        if (!ingredient) throw new NotFoundException('Insumo não encontrado');
        if (dec(ingredient.stock).lessThan(quantity)) {
          throw new BadRequestException('Perda maior que o estoque disponível');
        }
        await tx.ingredient.update({
          where: { id: ingredient.id },
          data: { stock: dec(ingredient.stock).minus(quantity) },
        });
      }

      return tx.lossRecord.create({
        data: {
          eventId,
          productId: dto.productId,
          ingredientId: dto.ingredientId,
          type: dto.type,
          quantity,
          reason: dto.reason,
          responsibleId: userId,
        },
      });
    });

    await this.audit.record({
      action: 'LOSS_REGISTER',
      userId,
      companyId,
      eventId,
      entity: 'LossRecord',
      entityId: loss.id,
      metadata: { type: dto.type, reason: dto.reason, quantity: quantity.toNumber() },
    });

    return loss;
  }
}
