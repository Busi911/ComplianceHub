-- Initial schema — alle Basistabellen im Ausgangszustand (sku-Spalte, vor EAN-Umbenennung)

CREATE TYPE "PackagingStatus" AS ENUM ('IMPORTED', 'ESTIMATED', 'SAMPLED', 'REVIEWED');

CREATE TABLE "ImportBatch" (
    "id"             TEXT NOT NULL,
    "name"           TEXT NOT NULL,
    "sourceFileName" TEXT,
    "importedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rowCount"       INTEGER NOT NULL DEFAULT 0,
    "successCount"   INTEGER NOT NULL DEFAULT 0,
    "errorCount"     INTEGER NOT NULL DEFAULT 0,
    "notes"          TEXT,
    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Product" (
    "id"                    TEXT NOT NULL,
    "sku"                   TEXT NOT NULL,
    "internalArticleNumber" TEXT,
    "manufacturer"          TEXT,
    "brand"                 TEXT,
    "productName"           TEXT NOT NULL,
    "category"              TEXT,
    "subcategory"           TEXT,
    "ekPrice"               DOUBLE PRECISION,
    "netWeightG"            DOUBLE PRECISION,
    "grossWeightG"          DOUBLE PRECISION,
    "netLengthMm"           DOUBLE PRECISION,
    "netWidthMm"            DOUBLE PRECISION,
    "netHeightMm"           DOUBLE PRECISION,
    "grossLengthMm"         DOUBLE PRECISION,
    "grossWidthMm"          DOUBLE PRECISION,
    "grossHeightMm"         DOUBLE PRECISION,
    "annualUnitsSold"       INTEGER,
    "samplingSkipReason"    TEXT,
    "samplingSkippedAt"     TIMESTAMP(3),
    "source"                TEXT,
    "importBatchId"         TEXT,
    "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"             TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");
CREATE INDEX "Product_category_idx" ON "Product"("category");
CREATE INDEX "Product_brand_idx" ON "Product"("brand");
CREATE INDEX "Product_manufacturer_idx" ON "Product"("manufacturer");
CREATE INDEX "Product_importBatchId_idx" ON "Product"("importBatchId");

CREATE TABLE "ProductPackagingProfile" (
    "id"                  TEXT NOT NULL,
    "productId"           TEXT NOT NULL,
    "status"              "PackagingStatus" NOT NULL DEFAULT 'IMPORTED',
    "estimatedPlasticG"   DOUBLE PRECISION,
    "estimatedPaperG"     DOUBLE PRECISION,
    "measuredPlasticG"    DOUBLE PRECISION,
    "measuredPaperG"      DOUBLE PRECISION,
    "currentPlasticG"     DOUBLE PRECISION,
    "currentPaperG"       DOUBLE PRECISION,
    "confidenceScore"     DOUBLE PRECISION,
    "estimationMethod"    TEXT,
    "estimationErrorPct"  DOUBLE PRECISION,
    "notes"               TEXT,
    "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"           TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProductPackagingProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductPackagingProfile_productId_key" ON "ProductPackagingProfile"("productId");

CREATE TABLE "SamplingRecord" (
    "id"                      TEXT NOT NULL,
    "productId"               TEXT NOT NULL,
    "sampledAt"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sampledBy"               TEXT,
    "measuredPlasticG"        DOUBLE PRECISION,
    "measuredPaperG"          DOUBLE PRECISION,
    "measuredTotalPackagingG" DOUBLE PRECISION,
    "netWeightAtSamplingG"    DOUBLE PRECISION,
    "grossWeightAtSamplingG"  DOUBLE PRECISION,
    "notes"                   TEXT,
    "isOutlier"               BOOLEAN NOT NULL DEFAULT false,
    "outlierReason"           TEXT,
    "createdAt"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SamplingRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SamplingRecord_productId_idx" ON "SamplingRecord"("productId");

CREATE TABLE "ProductEstimateHistory" (
    "id"          TEXT NOT NULL,
    "productId"   TEXT NOT NULL,
    "oldPlasticG" DOUBLE PRECISION,
    "oldPaperG"   DOUBLE PRECISION,
    "newPlasticG" DOUBLE PRECISION,
    "newPaperG"   DOUBLE PRECISION,
    "reason"      TEXT,
    "method"      TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductEstimateHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProductEstimateHistory_productId_idx" ON "ProductEstimateHistory"("productId");

CREATE TABLE "AuditLog" (
    "id"            TEXT NOT NULL,
    "entityType"    TEXT NOT NULL,
    "entityId"      TEXT NOT NULL,
    "action"        TEXT NOT NULL,
    "oldValuesJson" TEXT,
    "newValuesJson" TEXT,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

CREATE TABLE "BrandProfile" (
    "id"              TEXT NOT NULL,
    "entityType"      TEXT NOT NULL,
    "name"            TEXT NOT NULL,
    "notes"           TEXT,
    "packagingStyle"  TEXT,
    "typicalMaterial" TEXT,
    "tagsJson"        TEXT,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BrandProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BrandProfile_entityType_name_key" ON "BrandProfile"("entityType", "name");
CREATE INDEX "BrandProfile_name_idx" ON "BrandProfile"("name");

-- Foreign keys
ALTER TABLE "Product"
    ADD CONSTRAINT "Product_importBatchId_fkey"
    FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProductPackagingProfile"
    ADD CONSTRAINT "ProductPackagingProfile_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SamplingRecord"
    ADD CONSTRAINT "SamplingRecord_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductEstimateHistory"
    ADD CONSTRAINT "ProductEstimateHistory_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AuditLog"
    ADD CONSTRAINT "AuditLog_productId_fkey"
    FOREIGN KEY ("entityId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
