import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { dec } from '../common/money';
import { PrismaService } from '../prisma/prisma.service';
import {
  AdjustStockDto,
  CreateCategoryDto,
  CreateIngredientDto,
  CreateProductDto,
  RecipeDto,
  UpdateProductDto,
} from './dto/products.dto';

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ── Categorias ──
  createCategory(eventId: string, dto: CreateCategoryDto) {
    return this.prisma.category.create({ data: { eventId, name: dto.name } });
  }

  listCategories(eventId: string) {
    return this.prisma.category.findMany({ where: { eventId }, orderBy: { name: 'asc' } });
  }

  // ── Produtos ──
  createProduct(eventId: string, dto: CreateProductDto) {
    return this.prisma.product.create({
      data: {
        eventId,
        name: dto.name,
        price: dec(dto.price),
        costPrice: dec(dto.costPrice),
        categoryId: dto.categoryId,
        stock: dto.stock,
        minStock: dto.minStock,
      },
    });
  }

  listProducts(eventId: string) {
    return this.prisma.product.findMany({
      where: { eventId },
      include: { category: true },
      orderBy: { name: 'asc' },
    });
  }

  async getProduct(eventId: string, id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, eventId },
      include: { category: true, recipe: { include: { ingredient: true } } },
    });
    if (!product) throw new NotFoundException('Produto não encontrado');
    return product;
  }

  async updateProduct(eventId: string, id: string, dto: UpdateProductDto) {
    await this.getProduct(eventId, id);
    return this.prisma.product.update({
      where: { id },
      data: {
        name: dto.name,
        price: dto.price !== undefined ? dec(dto.price) : undefined,
        costPrice: dto.costPrice !== undefined ? dec(dto.costPrice) : undefined,
        categoryId: dto.categoryId,
        minStock: dto.minStock,
        active: dto.active,
      },
    });
  }

  // ── Insumos ──
  createIngredient(eventId: string, dto: CreateIngredientDto) {
    return this.prisma.ingredient.create({
      data: {
        eventId,
        name: dto.name,
        unit: dto.unit,
        stock: dec(dto.stock),
        minStock: dec(dto.minStock),
      },
    });
  }

  listIngredients(eventId: string) {
    return this.prisma.ingredient.findMany({ where: { eventId }, orderBy: { name: 'asc' } });
  }

  // ── Ficha técnica ──
  async setRecipe(eventId: string, productId: string, dto: RecipeDto) {
    await this.getProduct(eventId, productId);

    const ingredientIds = dto.items.map((i) => i.ingredientId);
    const valid = await this.prisma.ingredient.count({
      where: { id: { in: ingredientIds }, eventId },
    });
    if (valid !== new Set(ingredientIds).size) {
      throw new BadRequestException('Ficha técnica com insumo inválido para o evento');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.recipeItem.deleteMany({ where: { productId } });
      for (const item of dto.items) {
        await tx.recipeItem.create({
          data: { productId, ingredientId: item.ingredientId, quantity: dec(item.quantity) },
        });
      }
      return tx.recipeItem.findMany({
        where: { productId },
        include: { ingredient: true },
      });
    });
  }

  // ── Ajuste manual de estoque (admin) → auditoria ──
  async adjustStock(
    eventId: string,
    userId: string,
    companyId: string,
    dto: AdjustStockDto,
  ) {
    const product = await this.getProduct(eventId, dto.productId);
    const newStock = product.stock + dto.delta;
    if (newStock < 0) {
      throw new BadRequestException('Ajuste deixaria o estoque negativo');
    }

    const updated = await this.prisma.product.update({
      where: { id: product.id },
      data: { stock: newStock },
    });

    await this.audit.record({
      action: 'STOCK_ADJUST',
      userId,
      companyId,
      eventId,
      entity: 'Product',
      entityId: product.id,
      metadata: { delta: dto.delta, reason: dto.reason, from: product.stock, to: newStock },
    });

    return updated;
  }
}
