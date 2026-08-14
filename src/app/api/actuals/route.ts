import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { Actual, Category, isLocked, LOCKED_ERROR } from "@/models";
import { currentUserId } from "@/lib/auth";
import { actualSchema, rangeSchema } from "@/lib/validate";

export async function GET(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  await db();
  const { searchParams } = new URL(req.url);
  const range = rangeSchema.safeParse({
    from: searchParams.get("from"),
    to: searchParams.get("to"),
  });
  if (!range.success)
    return NextResponse.json(
      { error: "VALIDATION", message: range.error.issues[0].message },
      { status: 400 }
    );
  const actuals = await Actual.find({
    userId,
    month: { $gte: range.data.from, $lte: range.data.to },
  })
    .sort({ month: 1 })
    .lean();
  return NextResponse.json({ actuals });
}

export async function POST(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  await db();
  const parsed = actualSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success)
    return NextResponse.json(
      { error: "VALIDATION", message: parsed.error.issues[0].message },
      { status: 400 }
    );
  const { categoryId, month } = parsed.data;

  if (await isLocked(userId, month))
    return NextResponse.json(LOCKED_ERROR(month), { status: 423 });

  if (!(await Category.exists({ _id: categoryId, userId })))
    return NextResponse.json(
      { error: "NOT_FOUND", message: "Category not found." },
      { status: 404 }
    );

  const actual = await Actual.create({ userId, ...parsed.data });
  return NextResponse.json({ actual }, { status: 201 });
}
