import { z } from 'zod';
import { moneySchema as money } from '../../common/money';

export const createCategorySchema = z.object({ name: z.string().min(1) });
export type CreateCategoryDto = z.infer<typeof createCategorySchema>;

export const createProductSchema = z.object({
  name: z.string().min(1),
  price: money,
  /** Valor de compra (custo) — usado no cálculo de lucro no fechamento. */
  costPrice: money.default(0),
  categoryId: z.string().optional(),
  stock: z.number().int().min(0).default(0),
  minStock: z.number().int().min(0).default(0),
});
export type CreateProductDto = z.infer<typeof createProductSchema>;

export const updateProductSchema = z.object({
  name: z.string().min(1).optional(),
  price: money.optional(),
  costPrice: money.optional(),
  categoryId: z.string().nullable().optional(),
  minStock: z.number().int().min(0).optional(),
  active: z.boolean().optional(),
});
export type UpdateProductDto = z.infer<typeof updateProductSchema>;

export const createIngredientSchema = z.object({
  name: z.string().min(1),
  unit: z.string().min(1),
  stock: money.default(0),
  minStock: money.default(0),
});
export type CreateIngredientDto = z.infer<typeof createIngredientSchema>;

export const recipeSchema = z.object({
  items: z
    .array(
      z.object({
        ingredientId: z.string().min(1),
        quantity: money,
      }),
    )
    .min(1),
});
export type RecipeDto = z.infer<typeof recipeSchema>;

export const adjustStockSchema = z.object({
  productId: z.string().min(1),
  /** Delta de unidades (positivo entra, negativo sai). */
  delta: z.number().int(),
  reason: z.string().min(3),
});
export type AdjustStockDto = z.infer<typeof adjustStockSchema>;
