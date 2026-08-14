import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { Plan, Category, isLocked, LOCKED_ERROR } from "@/models";
import { currentUserId } from "@/lib/auth";
import { planSchema, rangeSchema } from "@/lib/validate";
import { withErrors } from "@/lib/route";

async function handleGET(req: NextRequest) {
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
  const plans = await Plan.find({
    userId,
    month: { $gte: range.data.from, $lte: range.data.to },
  }).lean();
  return NextResponse.json({ plans });
}

/** Upsert a monthly target. Rejected when the month is locked. */
async function handlePUT(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  await db();
  const parsed = planSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success)
    return NextResponse.json(
      { error: "VALIDATION", message: parsed.error.issues[0].message },
      { status: 400 }
    );
  const { categoryId, month, amountCents } = parsed.data;

  if (await isLocked(userId, month))
    return NextResponse.json(LOCKED_ERROR(month), { status: 423 });

  if (!(await Category.exists({ _id: categoryId, userId })))
    return NextResponse.json(
      { error: "NOT_FOUND", message: "Category not found." },
      { status: 404 }
    );

  const plan = await Plan.findOneAndUpdate(
    { userId, categoryId, month },
    { $set: { amountCents } },
    { new: true, upsert: true }
  );
  return NextResponse.json({ plan });
}

export const GET = withErrors(handleGET);
export const PUT = withErrors(handlePUT);
