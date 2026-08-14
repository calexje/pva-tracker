import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { Category } from "@/models";
import { currentUserId } from "@/lib/auth";
import { categorySchema } from "@/lib/validate";

export async function GET() {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  await db();
  const categories = await Category.find({ userId }).sort({ name: 1 }).lean();
  return NextResponse.json({ categories });
}

export async function POST(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  await db();
  const parsed = categorySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success)
    return NextResponse.json(
      { error: "VALIDATION", message: parsed.error.issues[0].message },
      { status: 400 }
    );
  try {
    const cat = await Category.create({ userId, name: parsed.data.name });
    return NextResponse.json({ category: cat }, { status: 201 });
  } catch (e: any) {
    if (e?.code === 11000)
      return NextResponse.json(
        { error: "DUPLICATE", message: `Category "${parsed.data.name}" already exists.` },
        { status: 409 }
      );
    throw e;
  }
}
