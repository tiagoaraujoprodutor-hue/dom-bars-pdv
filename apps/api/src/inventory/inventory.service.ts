import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { dec } from '../common/money';
import { PrismaService } from '../prisma/prisma.service';

export interface ConsumptionLine {
  productId: string;
  quantity: number;
}

type Tx = Prisma.TransactionClient;

/**
 * Movimentação de estoque. Centraliza a baixa de venda (produto + ficha técnica)
 * e o estorno (cancelamento/reembolso), garantindo um único ponto de verdade.
 * Regra (PLAN §6.5/6.6): produto com ficha técnica baixa os INSUMOS; produto sem
 * ficha baixa o próprio estoque. O contador de unidades do produto é sempre ajustado.
 */
@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Baixa de estoque para uma venda. Usa decremento ATÔMICO CONDICIONAL no banco
   * (UPDATE ... WHERE stock >= necessário) — não lê-modifica-grava. Isso evita
   * "lost update" e venda abaixo de zero quando 60 máquinas vendem o mesmo item
   * ao mesmo tempo. Se faltar produto/insumo, lança 400 (desfaz a venda inteira).
   */
  async applyConsumption(tx: Tx, lines: ConsumptionLine[]): Promise<void> {
    for (const line of lines) {
      if (line.quantity <= 0) {
        throw new BadRequestException('Quantidade deve ser maior que zero');
      }
      const product = await tx.product.findUnique({
        where: { id: line.productId },
        include: { recipe: { include: { ingredient: true } } },
      });
      if (!product) {
        throw new BadRequestException('Produto inexistente');
      }

      if (product.recipe.length > 0) {
        // Produto com ficha técnica: baixa os INSUMOS (atômico e condicional).
        for (const item of product.recipe) {
          const needed = dec(item.quantity).times(line.quantity);
          const res = await tx.ingredient.updateMany({
            where: { id: item.ingredientId, stock: { gte: needed } },
            data: { stock: { decrement: needed } },
          });
          if (res.count === 0) {
            throw new BadRequestException(`Estoque insuficiente do insumo ${item.ingredient.name}`);
          }
        }
        // Contador de unidades do produto (pode ser negativo em ficha técnica).
        await tx.product.update({
          where: { id: product.id },
          data: { stock: { decrement: line.quantity } },
        });
      } else {
        // Produto sem ficha: baixa o próprio estoque (atômico e condicional).
        const res = await tx.product.updateMany({
          where: { id: product.id, stock: { gte: line.quantity } },
          data: { stock: { decrement: line.quantity } },
        });
        if (res.count === 0) {
          throw new BadRequestException(`Estoque insuficiente de ${product.name}`);
        }
      }
    }
  }

  /** Estorna a baixa (cancelamento/reembolso) — incremento atômico (sempre seguro). */
  async revertConsumption(tx: Tx, lines: ConsumptionLine[]): Promise<void> {
    for (const line of lines) {
      const product = await tx.product.findUnique({
        where: { id: line.productId },
        include: { recipe: true },
      });
      if (!product) continue;

      for (const item of product.recipe) {
        const back = dec(item.quantity).times(line.quantity);
        await tx.ingredient.update({
          where: { id: item.ingredientId },
          data: { stock: { increment: back } },
        });
      }
      await tx.product.update({
        where: { id: product.id },
        data: { stock: { increment: line.quantity } },
      });
    }
  }

  /** Itens (produtos e insumos) abaixo do estoque mínimo (PLAN §6.5 alertas). */
  async lowStock(eventId: string) {
    const [products, ingredients] = await Promise.all([
      this.prisma.$queryRaw<{ id: string; name: string; stock: number; minStock: number }[]>`
        SELECT id, name, stock, "minStock" FROM "Product"
        WHERE "eventId" = ${eventId} AND active = true AND stock <= "minStock"`,
      this.prisma.$queryRaw<{ id: string; name: string; stock: string; minStock: string }[]>`
        SELECT id, name, stock, "minStock" FROM "Ingredient"
        WHERE "eventId" = ${eventId} AND stock <= "minStock"`,
    ]);
    return { products, ingredients };
  }
}
