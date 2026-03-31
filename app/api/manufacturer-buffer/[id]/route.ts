import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// DELETE /api/manufacturer-buffer/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.manufacturerDataBuffer.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
