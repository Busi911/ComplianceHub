import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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
