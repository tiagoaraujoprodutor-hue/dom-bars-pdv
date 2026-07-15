-- Custo de compra por produto (para apuração de lucro no fechamento do evento).
ALTER TABLE "Product" ADD COLUMN "costPrice" DECIMAL(10,2) NOT NULL DEFAULT 0;
