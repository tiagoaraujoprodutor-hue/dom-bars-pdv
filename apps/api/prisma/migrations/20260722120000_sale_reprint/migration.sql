-- Registro de reimpressão da ficha (aba de pedidos, gestão pelo admin).
ALTER TABLE "Sale" ADD COLUMN "reprintCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Sale" ADD COLUMN "reprintedAt" TIMESTAMP(3);
