import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { estimatePackaging } from "@/lib/estimation";
import { PackagingStatus } from "@prisma/client";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") ?? "";
    const category = searchParams.get("category") ?? "";
    const brand = searchParams.get("brand") ?? "";
    const status = searchParams.get("status") ?? "";
    const minSamples = parseInt(searchParams.get("minSamples") ?? "0");
    const page = parseInt(searchParams.get("page") ?? "1");
    const pageSize = parseInt(searchParams.get("pageSize") ?? "50");

    const where: Record<string, unknown> = {};

    if (search) {
      where.OR = [
        { ean: { contains: search, mode: "insensitive" } },
        { internalArticleNumber: { contains: search, mode: "insensitive" } },
        { productName: { contains: search, mode: "insensitive" } },
        { manufacturer: { contains: search, mode: "insensitive" } },
        { brand: { contains: search, mode: "insensitive" } },
      ];
    }

    if (category) where.category = { equals: category, mode: "insensitive" };
    if (brand) where.brand = { equals: brand, mode: "insensitive" };

    if (status) {
      where.packagingProfile = { status: status.toUpperCase() };
    }

    // For minSamples >= 1, use Prisma relation filter.
    // For >= 2 we post-filter (Prisma doesn't support relation count in WHERE).
    if (minSamples >= 1) {
      where.samplingRecords = { some: {} };
    }

    if (minSamples >= 2) {
      // Prisma doesn't support relation _count in WHERE, so use a raw query to get IDs
      // efficiently — avoids fetching thousands of rows just to filter in memory.
      // Build the extra category condition for the raw query separately.
      const rows = category
        ? await prisma.$queryRaw<{ id: string }[]>`
            SELECT p."id" FROM "Product" p
            WHERE (SELECT COUNT(*) FROM "SamplingRecord" s WHERE s."productId" = p."id") >= ${minSamples}
              AND lower(p."category") = lower(${category})
            ORDER BY p."createdAt" DESC`
        : await prisma.$queryRaw<{ id: string }[]>`
            SELECT p."id" FROM "Product" p
            WHERE (SELECT COUNT(*) FROM "SamplingRecord" s WHERE s."productId" = p."id") >= ${minSamples}
            ORDER BY p."createdAt" DESC`;

      const ids = rows.map((r) => r.id);
      const total = ids.length;
      const pagedIds = ids.slice((page - 1) * pageSize, page * pageSize);

      const products = await prisma.product.findMany({
        where: { id: { in: pagedIds } },
        include: {
          packagingProfile: true,
          _count: { select: { samplingRecords: true } },
        },
        orderBy: { createdAt: "desc" },
      });

      const [categories, brands] = await Promise.all([
        prisma.product.findMany({
          select: { category: true },
          where: { category: { not: null } },
          distinct: ["category"],
          orderBy: { category: "asc" },
        }),
        prisma.product.findMany({
          select: { brand: true },
          where: { brand: { not: null } },
          distinct: ["brand"],
          orderBy: { brand: "asc" },
        }),
      ]);

      return NextResponse.json({
        products,
        total,
        page,
        pageSize,
        pageCount: Math.ceil(total / pageSize),
        filterOptions: {
          categories: categories.map((c) => c.category).filter(Boolean),
          brands: brands.map((b) => b.brand).filter(Boolean),
        },
      });
    }

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: {
          packagingProfile: true,
          _count: { select: { samplingRecords: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.product.count({ where }),
    ]);

    // Fetch distinct categories and brands for filter options
    const [categories, brands] = await Promise.all([
      prisma.product.findMany({
        select: { category: true },
        where: { category: { not: null } },
        distinct: ["category"],
        orderBy: { category: "asc" },
      }),
      prisma.product.findMany({
        select: { brand: true },
        where: { brand: { not: null } },
        distinct: ["brand"],
        orderBy: { brand: "asc" },
      }),
    ]);

    return NextResponse.json({
      products,
      total,
      page,
      pageSize,
      pageCount: Math.ceil(total / pageSize),
      filterOptions: {
        categories: categories.map((c) => c.category).filter(Boolean),
        brands: brands.map((b) => b.brand).filter(Boolean),
      },
    });
  } catch (error) {
    console.error("Products list error:", error);
    return NextResponse.json(
      { error: "Failed to load products" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      ean,
      productName,
      internalArticleNumber,
      manufacturer,
      brand,
      category,
      subcategory,
      ekPrice,
      netWeightG,
      grossWeightG,
      annualUnitsSold,
    } = body;

    if (!ean || typeof ean !== "string" || !ean.trim()) {
      return NextResponse.json({ error: "EAN ist erforderlich" }, { status: 400 });
    }
    if (!productName || typeof productName !== "string" || !productName.trim()) {
      return NextResponse.json({ error: "Produktname ist erforderlich" }, { status: 400 });
    }

    const existing = await prisma.product.findUnique({ where: { ean: ean.trim() } });
    if (existing) {
      return NextResponse.json({ error: "Ein Produkt mit dieser EAN existiert bereits" }, { status: 409 });
    }

    const parseNum = (v: unknown) => (v != null && v !== "" ? parseFloat(String(v)) : null);
    const parseInt10 = (v: unknown) => (v != null && v !== "" ? parseInt(String(v), 10) : null);

    const product = await prisma.product.create({
      data: {
        ean: ean.trim(),
        productName: productName.trim(),
        internalArticleNumber: internalArticleNumber?.trim() || null,
        manufacturer: manufacturer?.trim() || null,
        brand: brand?.trim() || null,
        category: category?.trim() || null,
        subcategory: subcategory?.trim() || null,
        ekPrice: parseNum(ekPrice),
        netWeightG: parseNum(netWeightG),
        grossWeightG: parseNum(grossWeightG),
        annualUnitsSold: parseInt10(annualUnitsSold),
      },
    });

    await prisma.productPackagingProfile.create({
      data: { productId: product.id, status: PackagingStatus.IMPORTED },
    });

    const estimateResult = await estimatePackaging(product.id);
    if (estimateResult) {
      await prisma.productPackagingProfile.update({
        where: { productId: product.id },
        data: {
          status: PackagingStatus.ESTIMATED,
          currentPlasticG: estimateResult.plasticG,
          currentPaperG: estimateResult.paperG,
          estimatedPlasticG: estimateResult.plasticG,
          estimatedPaperG: estimateResult.paperG,
          confidenceScore: estimateResult.confidenceScore,
          estimationMethod: estimateResult.method,
        },
      });
    }

    return NextResponse.json(product, { status: 201 });
  } catch (error) {
    console.error("Product create error:", error);
    return NextResponse.json({ error: "Failed to create product" }, { status: 500 });
  }
}
