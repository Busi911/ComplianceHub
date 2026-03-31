-- Rename sku → ean on Product table
-- (IF EXISTS guard makes this safe against already-renamed DBs)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'Product' AND column_name = 'sku'
  ) THEN
    ALTER TABLE "Product" RENAME COLUMN "sku" TO "ean";
  END IF;
END $$;

-- Rename the unique index to match new column name
DROP INDEX IF EXISTS "Product_sku_key";
CREATE UNIQUE INDEX IF NOT EXISTS "Product_ean_key" ON "Product"("ean");

-- Add Hersteller-Angaben fields
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "mfrNetWeightG"   DOUBLE PRECISION;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "mfrGrossWeightG" DOUBLE PRECISION;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "mfrPlasticG"     DOUBLE PRECISION;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "mfrPaperG"       DOUBLE PRECISION;

-- Create ManufacturerRequest table
CREATE TABLE IF NOT EXISTS "ManufacturerRequest" (
    "id"               TEXT NOT NULL,
    "manufacturerName" TEXT NOT NULL,
    "contactEmail"     TEXT,
    "status"           TEXT NOT NULL DEFAULT 'OFFEN',
    "notes"            TEXT,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ManufacturerRequest_pkey" PRIMARY KEY ("id")
);

-- Create ManufacturerRequestItem table
CREATE TABLE IF NOT EXISTS "ManufacturerRequestItem" (
    "id"        TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "notes"     TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ManufacturerRequestItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ManufacturerRequestItem_requestId_productId_key"
    ON "ManufacturerRequestItem"("requestId", "productId");
CREATE INDEX IF NOT EXISTS "ManufacturerRequestItem_requestId_idx" ON "ManufacturerRequestItem"("requestId");
CREATE INDEX IF NOT EXISTS "ManufacturerRequestItem_productId_idx" ON "ManufacturerRequestItem"("productId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'ManufacturerRequestItem_requestId_fkey'
  ) THEN
    ALTER TABLE "ManufacturerRequestItem"
      ADD CONSTRAINT "ManufacturerRequestItem_requestId_fkey"
      FOREIGN KEY ("requestId") REFERENCES "ManufacturerRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'ManufacturerRequestItem_productId_fkey'
  ) THEN
    ALTER TABLE "ManufacturerRequestItem"
      ADD CONSTRAINT "ManufacturerRequestItem_productId_fkey"
      FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
