import { PrismaClient, PackagingStatus } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 Seeding database...");

  // ---- Import Batch ----
  const batch = await prisma.importBatch.create({
    data: {
      name: "Seed-Daten 2026-Q1",
      sourceFileName: "seed.ts",
      rowCount: 15,
      successCount: 15,
      errorCount: 0,
      notes: "Initiale Beispieldaten",
    },
  });

  // ---- Products ----
  const products = [
    // Festplatten
    {
      sku: "WD-BLUE-1TB-001",
      productName: "WD Blue 1TB 3.5\" HDD",
      manufacturer: "Western Digital",
      brand: "WD",
      category: "Festplatte",
      subcategory: "HDD 3.5",
      ekPrice: 38.9,
      netWeightG: 400,
      grossWeightG: 520,
      netLengthMm: 146,
      netWidthMm: 101,
      netHeightMm: 26,
      grossLengthMm: 165,
      grossWidthMm: 120,
      grossHeightMm: 45,
    },
    {
      sku: "WD-RED-4TB-002",
      productName: "WD Red Plus 4TB NAS HDD",
      manufacturer: "Western Digital",
      brand: "WD",
      category: "Festplatte",
      subcategory: "HDD 3.5",
      ekPrice: 72.5,
      netWeightG: 580,
      grossWeightG: 720,
      netLengthMm: 146,
      netWidthMm: 101,
      netHeightMm: 26,
      grossLengthMm: 170,
      grossWidthMm: 125,
      grossHeightMm: 50,
    },
    {
      sku: "SAM-870-500-003",
      productName: "Samsung 870 EVO 500GB SSD",
      manufacturer: "Samsung",
      brand: "Samsung",
      category: "Festplatte",
      subcategory: "SSD 2.5",
      ekPrice: 55.0,
      netWeightG: 58,
      grossWeightG: 90,
      netLengthMm: 100,
      netWidthMm: 70,
      netHeightMm: 7,
      grossLengthMm: 120,
      grossWidthMm: 88,
      grossHeightMm: 15,
    },
    {
      sku: "SAM-870-1TB-004",
      productName: "Samsung 870 EVO 1TB SSD",
      manufacturer: "Samsung",
      brand: "Samsung",
      category: "Festplatte",
      subcategory: "SSD 2.5",
      ekPrice: 89.0,
      netWeightG: 58,
      grossWeightG: 92,
      netLengthMm: 100,
      netWidthMm: 70,
      netHeightMm: 7,
      grossLengthMm: 120,
      grossWidthMm: 88,
      grossHeightMm: 15,
    },
    // PCs / Komponenten
    {
      sku: "INL-NUC-I5-005",
      productName: "Intel NUC 12 Pro i5 Mini-PC",
      manufacturer: "Intel",
      brand: "Intel NUC",
      category: "PC",
      subcategory: "Mini-PC",
      ekPrice: 320.0,
      netWeightG: 1100,
      grossWeightG: 1650,
      netLengthMm: 117,
      netWidthMm: 112,
      netHeightMm: 54,
      grossLengthMm: 210,
      grossWidthMm: 190,
      grossHeightMm: 120,
    },
    {
      sku: "LEN-MINI-006",
      productName: "Lenovo ThinkCentre M75q Gen 2",
      manufacturer: "Lenovo",
      brand: "ThinkCentre",
      category: "PC",
      subcategory: "Mini-PC",
      ekPrice: 450.0,
      netWeightG: 1400,
      grossWeightG: 2100,
      netLengthMm: 179,
      netWidthMm: 183,
      netHeightMm: 36,
      grossLengthMm: 310,
      grossWidthMm: 260,
      grossHeightMm: 120,
    },
    // Monitore
    {
      sku: "LG-27UK-007",
      productName: "LG 27UK850 4K Monitor 27\"",
      manufacturer: "LG",
      brand: "LG",
      category: "Monitor",
      subcategory: "27 Zoll",
      ekPrice: 320.0,
      netWeightG: 5400,
      grossWeightG: 6800,
      netLengthMm: 625,
      netWidthMm: 368,
      netHeightMm: 56,
      grossLengthMm: 710,
      grossWidthMm: 450,
      grossHeightMm: 170,
    },
    {
      sku: "DEL-P2422H-008",
      productName: "Dell P2422H Full HD Monitor 24\"",
      manufacturer: "Dell",
      brand: "Dell",
      category: "Monitor",
      subcategory: "24 Zoll",
      ekPrice: 185.0,
      netWeightG: 3900,
      grossWeightG: 5200,
      netLengthMm: 540,
      netWidthMm: 332,
      netHeightMm: 52,
      grossLengthMm: 620,
      grossWidthMm: 410,
      grossHeightMm: 150,
    },
    // Zubehör
    {
      sku: "LOG-MXM3-009",
      productName: "Logitech MX Master 3 Maus",
      manufacturer: "Logitech",
      brand: "Logitech",
      category: "Zubehör",
      subcategory: "Maus",
      ekPrice: 65.0,
      netWeightG: 141,
      grossWeightG: 182,
      netLengthMm: 128,
      netWidthMm: 85,
      netHeightMm: 44,
      grossLengthMm: 152,
      grossWidthMm: 102,
      grossHeightMm: 65,
    },
    {
      sku: "LOG-K380-010",
      productName: "Logitech K380 Bluetooth Tastatur",
      manufacturer: "Logitech",
      brand: "Logitech",
      category: "Zubehör",
      subcategory: "Tastatur",
      ekPrice: 38.0,
      netWeightG: 420,
      grossWeightG: 510,
      netLengthMm: 279,
      netWidthMm: 124,
      netHeightMm: 16,
      grossLengthMm: 310,
      grossWidthMm: 150,
      grossHeightMm: 45,
    },
    {
      sku: "TPL-CAT6-011",
      productName: "TP-Link CAT6 Patchkabel 2m",
      manufacturer: "TP-Link",
      brand: "TP-Link",
      category: "Zubehör",
      subcategory: "Kabel",
      ekPrice: 3.5,
      netWeightG: 45,
      grossWeightG: 80,
      netLengthMm: 200,
      netWidthMm: 10,
      netHeightMm: 5,
      grossLengthMm: 220,
      grossWidthMm: 120,
      grossHeightMm: 30,
    },
    {
      sku: "APC-UPS-012",
      productName: "APC Back-UPS 700VA",
      manufacturer: "APC",
      brand: "APC",
      category: "Zubehör",
      subcategory: "USV",
      ekPrice: 89.0,
      netWeightG: 4200,
      grossWeightG: 5100,
      netLengthMm: 280,
      netWidthMm: 100,
      netHeightMm: 140,
      grossLengthMm: 350,
      grossWidthMm: 180,
      grossHeightMm: 210,
    },
    // Ohne vollständige Daten (um Mindestdaten-Check zu testen)
    {
      sku: "UNKN-CABLE-013",
      productName: "Generic USB-C Kabel",
      manufacturer: null,
      brand: null,
      category: "Zubehör",
      subcategory: "Kabel",
      ekPrice: 2.5,
      netWeightG: null,
      grossWeightG: null,
      netLengthMm: null,
      netWidthMm: null,
      netHeightMm: null,
      grossLengthMm: null,
      grossWidthMm: null,
      grossHeightMm: null,
    },
    {
      sku: "SAM-T5-014",
      productName: "Samsung T5 Portable SSD 500GB",
      manufacturer: "Samsung",
      brand: "Samsung",
      category: "Festplatte",
      subcategory: "Externe SSD",
      ekPrice: 75.0,
      netWeightG: 51,
      grossWeightG: 115,
      netLengthMm: 74,
      netWidthMm: 57,
      netHeightMm: 10,
      grossLengthMm: 140,
      grossWidthMm: 110,
      grossHeightMm: 40,
    },
    {
      sku: "LOG-C920-015",
      productName: "Logitech C920 HD Webcam",
      manufacturer: "Logitech",
      brand: "Logitech",
      category: "Zubehör",
      subcategory: "Webcam",
      ekPrice: 55.0,
      netWeightG: 162,
      grossWeightG: 320,
      netLengthMm: 96,
      netWidthMm: 60,
      netHeightMm: 50,
      grossLengthMm: 185,
      grossWidthMm: 130,
      grossHeightMm: 85,
    },
  ];

  const createdProducts: Array<{ id: string; sku: string; category: string | null; subcategory: string | null }> = [];

  for (const p of products) {
    const product = await prisma.product.upsert({
      where: { sku: p.sku },
      create: { ...p, importBatchId: batch.id },
      update: { ...p },
    });
    createdProducts.push({ id: product.id, sku: product.sku, category: product.category, subcategory: product.subcategory });

    // Create initial packaging profile
    await prisma.productPackagingProfile.upsert({
      where: { productId: product.id },
      create: { productId: product.id, status: PackagingStatus.IMPORTED },
      update: {},
    });
  }

  console.log(`✓ Created ${createdProducts.length} products`);

  // ---- Sampling Records ----
  // Add sampling records for several products to seed the estimation engine

  const samplingData = [
    // WD Blue 1TB HDD
    { sku: "WD-BLUE-1TB-001", plasticG: 42.5, paperG: 185.0, total: 227.5, sampledBy: "Max M." },
    { sku: "WD-BLUE-1TB-001", plasticG: 44.0, paperG: 182.0, total: 226.0, sampledBy: "Lisa K." },
    // WD Red 4TB HDD (similar to Blue, slightly more packaging)
    { sku: "WD-RED-4TB-002", plasticG: 55.0, paperG: 220.0, total: 275.0, sampledBy: "Max M." },
    // Samsung 870 EVO 500GB SSD
    { sku: "SAM-870-500-003", plasticG: 18.0, paperG: 62.0, total: 80.0, sampledBy: "Lisa K." },
    { sku: "SAM-870-500-003", plasticG: 17.5, paperG: 60.0, total: 77.5, sampledBy: "Max M." },
    // Samsung T5 Portable SSD
    { sku: "SAM-T5-014", plasticG: 22.0, paperG: 55.0, total: 77.0, sampledBy: "Lisa K." },
    // Intel NUC Mini-PC
    { sku: "INL-NUC-I5-005", plasticG: 120.0, paperG: 380.0, total: 500.0, sampledBy: "Max M." },
    // LG Monitor
    { sku: "LG-27UK-007", plasticG: 340.0, paperG: 1100.0, total: 1440.0, sampledBy: "Lisa K." },
    // Dell Monitor
    { sku: "DEL-P2422H-008", plasticG: 280.0, paperG: 920.0, total: 1200.0, sampledBy: "Max M." },
    // Logitech MX Master 3 Maus
    { sku: "LOG-MXM3-009", plasticG: 28.0, paperG: 90.0, total: 118.0, sampledBy: "Lisa K." },
    // Logitech K380 Tastatur
    { sku: "LOG-K380-010", plasticG: 35.0, paperG: 110.0, total: 145.0, sampledBy: "Max M." },
    // TP-Link Kabel
    { sku: "TPL-CAT6-011", plasticG: 8.0, paperG: 28.0, total: 36.0, sampledBy: "Lisa K." },
  ];

  for (const s of samplingData) {
    const product = createdProducts.find((p) => p.sku === s.sku);
    if (!product) continue;

    await prisma.samplingRecord.create({
      data: {
        productId: product.id,
        sampledBy: s.sampledBy,
        measuredPlasticG: s.plasticG,
        measuredPaperG: s.paperG,
        measuredTotalPackagingG: s.total,
        sampledAt: new Date(
          Date.now() - Math.floor(Math.random() * 30 * 24 * 60 * 60 * 1000)
        ),
      },
    });
  }

  console.log(`✓ Created ${samplingData.length} sampling records`);

  // ---- Run estimation for all products ----
  // Run estimation for each product
  for (const p of createdProducts) {
    try {
      // Find sampling records for this product
      const samplingRecords = await prisma.samplingRecord.findMany({
        where: { productId: p.id },
      });

      if (samplingRecords.length > 0) {
        // Direct sampling average
        const plasticValues = samplingRecords
          .map((r) => r.measuredPlasticG)
          .filter((v): v is number => v !== null);
        const paperValues = samplingRecords
          .map((r) => r.measuredPaperG)
          .filter((v): v is number => v !== null);

        const plasticG =
          plasticValues.length > 0
            ? plasticValues.reduce((a: number, b: number) => a + b, 0) / plasticValues.length
            : null;
        const paperG =
          paperValues.length > 0
            ? paperValues.reduce((a: number, b: number) => a + b, 0) / paperValues.length
            : null;

        const confidence = Math.min(0.5 + samplingRecords.length * 0.15, 0.95);

        await prisma.productPackagingProfile.update({
          where: { productId: p.id },
          data: {
            status: PackagingStatus.SAMPLED,
            currentPlasticG: plasticG,
            currentPaperG: paperG,
            measuredPlasticG: plasticG,
            measuredPaperG: paperG,
            confidenceScore: confidence,
            estimationMethod: `own_sampling_avg_n${samplingRecords.length}`,
          },
        });
      } else if (p.category) {
        // Category-based estimation: find products in same category with sampling
        const sampled = await prisma.product.findMany({
          where: {
            category: p.category,
            id: { not: p.id },
            samplingRecords: { some: {} },
          },
          include: { samplingRecords: true },
          take: 10,
        });

        if (sampled.length > 0) {
          const plasticValues = sampled
            .flatMap((sp) => sp.samplingRecords.map((r) => r.measuredPlasticG))
            .filter((v): v is number => v !== null);
          const paperValues = sampled
            .flatMap((sp) => sp.samplingRecords.map((r) => r.measuredPaperG))
            .filter((v): v is number => v !== null);

          if (plasticValues.length > 0 || paperValues.length > 0) {
            const plasticG =
              plasticValues.length > 0
                ? plasticValues.reduce((a: number, b: number) => a + b, 0) / plasticValues.length
                : null;
            const paperG =
              paperValues.length > 0
                ? paperValues.reduce((a: number, b: number) => a + b, 0) / paperValues.length
                : null;

            await prisma.productPackagingProfile.update({
              where: { productId: p.id },
              data: {
                status: PackagingStatus.ESTIMATED,
                currentPlasticG: plasticG,
                currentPaperG: paperG,
                estimatedPlasticG: plasticG,
                estimatedPaperG: paperG,
                confidenceScore: 0.3,
                estimationMethod: `category_avg_n${sampled.length}`,
              },
            });
          }
        }
      }
    } catch (err) {
      console.warn(`  Warning: Could not estimate for ${p.sku}:`, err);
    }
  }

  console.log("✓ Estimations computed");
  console.log("✅ Seeding complete!");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
