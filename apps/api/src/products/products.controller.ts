import { Body, Controller, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthUser, EventScope } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { EventScopeParam } from '../auth/decorators/event-role.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { EventScopeGuard } from '../auth/guards/event-scope.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { InventoryService } from '../inventory/inventory.service';
import {
  AdjustStockDto,
  CreateCategoryDto,
  CreateIngredientDto,
  CreateProductDto,
  RecipeDto,
  UpdateProductDto,
  adjustStockSchema,
  createCategorySchema,
  createIngredientSchema,
  createProductSchema,
  recipeSchema,
  updateProductSchema,
} from './dto/products.dto';
import { ProductsService } from './products.service';

@ApiTags('Produtos & Estoque')
@ApiBearerAuth()
@Controller('events/:eventId')
@UseGuards(JwtAuthGuard, EventScopeGuard, RolesGuard)
export class ProductsController {
  constructor(
    private readonly products: ProductsService,
    private readonly inventory: InventoryService,
  ) {}

  // Consulta liberada a qualquer membro do evento.
  @Get('products')
  listProducts(@EventScopeParam() scope: EventScope) {
    return this.products.listProducts(scope.eventId);
  }

  @Get('products/:id')
  getProduct(@EventScopeParam() scope: EventScope, @Param('id') id: string) {
    return this.products.getProduct(scope.eventId, id);
  }

  @Get('categories')
  listCategories(@EventScopeParam() scope: EventScope) {
    return this.products.listCategories(scope.eventId);
  }

  @Get('ingredients')
  listIngredients(@EventScopeParam() scope: EventScope) {
    return this.products.listIngredients(scope.eventId);
  }

  @Get('inventory/low-stock')
  @Roles(Role.SUPERVISOR, Role.ADMINISTRADOR)
  lowStock(@EventScopeParam() scope: EventScope) {
    return this.inventory.lowStock(scope.eventId);
  }

  // Cadastro/alteração: somente Administrador.
  @Post('categories')
  @Roles(Role.ADMINISTRADOR)
  createCategory(
    @EventScopeParam() scope: EventScope,
    @Body(new ZodValidationPipe(createCategorySchema)) dto: CreateCategoryDto,
  ) {
    return this.products.createCategory(scope.eventId, dto);
  }

  @Post('products')
  @Roles(Role.ADMINISTRADOR)
  createProduct(
    @EventScopeParam() scope: EventScope,
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createProductSchema)) dto: CreateProductDto,
  ) {
    return this.products.createProduct(scope.eventId, user.userId, user.companyId, dto);
  }

  @Patch('products/:id')
  @Roles(Role.ADMINISTRADOR)
  updateProduct(
    @EventScopeParam() scope: EventScope,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateProductSchema)) dto: UpdateProductDto,
  ) {
    return this.products.updateProduct(scope.eventId, user.userId, user.companyId, id, dto);
  }

  @Post('ingredients')
  @Roles(Role.ADMINISTRADOR)
  createIngredient(
    @EventScopeParam() scope: EventScope,
    @Body(new ZodValidationPipe(createIngredientSchema)) dto: CreateIngredientDto,
  ) {
    return this.products.createIngredient(scope.eventId, dto);
  }

  @Put('products/:id/recipe')
  @Roles(Role.ADMINISTRADOR)
  setRecipe(
    @EventScopeParam() scope: EventScope,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(recipeSchema)) dto: RecipeDto,
  ) {
    return this.products.setRecipe(scope.eventId, id, dto);
  }

  @Post('inventory/adjust')
  @Roles(Role.ADMINISTRADOR)
  adjustStock(
    @EventScopeParam() scope: EventScope,
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(adjustStockSchema)) dto: AdjustStockDto,
  ) {
    return this.products.adjustStock(scope.eventId, user.userId, user.companyId, dto);
  }
}
