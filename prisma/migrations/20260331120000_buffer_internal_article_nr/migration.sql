-- Migration: internalArticleNr zum ManufacturerDataBuffer hinzufügen, ean optional machen

-- ean nullable machen (war NOT NULL)
ALTER TABLE "ManufacturerDataBuffer" ALTER COLUMN "ean" DROP NOT NULL;

-- internalArticleNr hinzufügen
ALTER TABLE "ManufacturerDataBuffer" ADD COLUMN IF NOT EXISTS "internalArticleNr" TEXT;

-- Index auf internalArticleNr
CREATE INDEX IF NOT EXISTS "ManufacturerDataBuffer_internalArticleNr_idx"
  ON "ManufacturerDataBuffer"("internalArticleNr");
