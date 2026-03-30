import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const VALID_REASONS = ["out_of_stock", "discontinued", "other"];

// POST /api/sampling/skip — mark a product as skipped in the priority list
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { productId, reason } = body as { productId?: string; reason?: string };

    if (!productId) return NextResponse.json({ error: "productId required" }, { status: 400 });
    if (!reason || !VALID_REASONS.includes(reason)) {
      return NextResponse.json({ error: "reason must be one of: " + VALID_REASONS.join(", ") }, { status: 400 });
    }

    await prisma.product.update({
      where: { id: productId },
      data: {
        samplingSkipReason: reason,
        samplingSkippedAt: new Date(),
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Skip error:", error);
    return NextResponse.json({ error: "Failed to skip product" }, { status: 500 });
  }
}

// DELETE /api/sampling/skip?productId=xxx — undo skip
export async function DELETE(request: NextRequest) {
  try {
    const productId = new URL(request.url).searchParams.get("productId");
    if (!productId) return NextResponse.json({ error: "productId required" }, { status: 400 });

    await prisma.product.update({
      where: { id: productId },
      data: {
        samplingSkipReason: null,
        samplingSkippedAt: null,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Unskip error:", error);
    return NextResponse.json({ error: "Failed to unskip product" }, { status: 500 });
  }
}
