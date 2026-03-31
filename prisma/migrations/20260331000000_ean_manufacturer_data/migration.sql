-- Rename sku → ean on Product table
ALTER TABLE "Product" RENAME COLUMN "sku" TO "ean";

-- Add Hersteller-Angaben fields
ALTER TABLE "Product" ADD COLUMN "mfrNetWeightG"   DOUBLE PRECISION;
ALTER TABLE "Product" ADD COLUMN "mfrGrossWeightG" DOUBLE PRECISION;
ALTER TABLE "Product" ADD COLUMN "mfrPlasticG"     DOUBLE PRECISION;
ALTER TABLE "Product" ADD COLUMN "mfrPaperG"       DOUBLE PRECISION;

-- Create ManufacturerRequest table
CREATE TABLE "ManufacturerRequest" (
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
CREATE TABLE "ManufacturerRequestItem" (
    "id"        TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "notes"     TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ManufacturerRequestItem_pkey" PRIMARY KEY ("id")
);

-- Unique constraint: one product per request
CREATE UNIQUE INDEX "ManufacturerRequestItem_requestId_productId_key"
    ON "ManufacturerRequestItem"("requestId", "productId");

CREATE INDEX "ManufacturerRequestItem_requestId_idx" ON "ManufacturerRequestItem"("requestId");
CREATE INDEX "ManufacturerRequestItem_productId_idx" ON "ManufacturerRequestItem"("productId");

-- Foreign keys
ALTER TABLE "ManufacturerRequestItem"
    ADD CONSTRAINT "ManufacturerRequestItem_requestId_fkey"
    FOREIGN KEY ("requestId") REFERENCES "ManufacturerRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ManufacturerRequestItem"
    ADD CONSTRAINT "ManufacturerRequestItem_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
