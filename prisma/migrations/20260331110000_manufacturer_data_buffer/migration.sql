-- CreateTable
CREATE TABLE "ManufacturerDataBuffer" (
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

-- CreateIndex
CREATE INDEX "ManufacturerDataBuffer_ean_idx" ON "ManufacturerDataBuffer"("ean");

-- CreateIndex
CREATE INDEX "ManufacturerDataBuffer_matchedProductId_idx" ON "ManufacturerDataBuffer"("matchedProductId");

-- AddForeignKey
ALTER TABLE "ManufacturerDataBuffer" ADD CONSTRAINT "ManufacturerDataBuffer_matchedProductId_fkey"
    FOREIGN KEY ("matchedProductId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
