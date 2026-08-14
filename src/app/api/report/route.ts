import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { db } from "@/lib/db";
import { Plan, Actual, Category, Lock } from "@/models";
import { currentUserId } from "@/lib/auth";
import { rangeSchema } from "@/lib/validate";
import { buildReport, type ReportInput } from "@/lib/variance";

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
  const { from, to } = range.data;
  const uid = mongoose.Types.ObjectId.createFromHexString(userId);

  const [plans, actualsAgg, cats, locks] = await Promise.all([
    Plan.find({ userId, month: { $gte: from, $lte: to } }).lean(),
    Actual.aggregate([
      { $match: { userId: uid, month: { $gte: from, $lte: to } } },
      {
        $group: {
          _id: { categoryId: "$categoryId", month: "$month" },
          total: { $sum: "$amountCents" },
        },
      },
    ]),
    Category.find({ userId }).lean(),
    Lock.find({ userId }).lean(),
  ]);

  const catName = new Map(cats.map((c: any) => [c._id.toString(), c.name]));
  const cells = new Map<string, ReportInput>();
  const key = (cat: string, month: string) => `${cat}|${month}`;

  for (const p of plans as any[]) {
    const cid = p.categoryId.toString();
    cells.set(key(cid, p.month), {
      month: p.month,
      categoryId: cid,
      categoryName: catName.get(cid) ?? "(deleted)",
      planCents: p.amountCents,
      actualCents: null,
    });
  }
  for (const a of actualsAgg as any[]) {
    const cid = a._id.categoryId.toString();
    const k = key(cid, a._id.month);
    const existing = cells.get(k);
    if (existing) existing.actualCents = a.total;
    else
      cells.set(k, {
        month: a._id.month,
        categoryId: cid,
        categoryName: catName.get(cid) ?? "(deleted)",
        planCents: null,
        actualCents: a.total,
      });
  }

  const report = buildReport([...cells.values()]);
  return NextResponse.json({
    ...report,
    lockedMonths: (locks as any[]).map((l) => l.month),
  });
}
