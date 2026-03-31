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
        { sku: { contains: search, mode: "insensitive" } },
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
      // Post-filter: fetch up to 5000 matching, filter, paginate manually
      const all = await prisma.product.findMany({
        where,
        include: {
          packagingProfile: true,
          _count: { select: { samplingRecords: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 5000,
      });
      const filtered = all.filter((p) => p._count.samplingRecords >= minSamples);
      const total = filtered.length;
      const products = filtered.slice((page - 1) * pageSize, page * pageSize);

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
