-- CreateTable (idempotent)
CREATE TABLE IF NOT EXISTS "ManufacturerDataBuffer" (
    "id" TEXT NOT NULL,
    "ean" TEXT NOT NULL,
    "manufacturerName" TEXT,
    "productName" TEXT,
    "mfrNetWeightG" DOUBLE PRECISION,
    "mfrGrossWeightG" DOUBLE PRECISION,
    "mfrPlasticG" DOUBLE PRECISION,
    "mfrPaperG" DOUBLE PRECISION,
    "extraJson" TEXT,
    "sourceFileName" TEXT,
    "matchedProductId" TEXT,
    "matchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManufacturerDataBuffer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (idempotent)
CREATE INDEX IF NOT EXISTS "ManufacturerDataBuffer_ean_idx" ON "ManufacturerDataBuffer"("ean");
CREATE INDEX IF NOT EXISTS "ManufacturerDataBuffer_matchedProductId_idx" ON "ManufacturerDataBuffer"("matchedProductId");

-- AddForeignKey (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'ManufacturerDataBuffer_matchedProductId_fkey'
  ) THEN
    ALTER TABLE "ManufacturerDataBuffer"
      ADD CONSTRAINT "ManufacturerDataBuffer_matchedProductId_fkey"
      FOREIGN KEY ("matchedProductId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
