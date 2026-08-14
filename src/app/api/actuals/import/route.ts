import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { Actual, Category, Lock } from "@/models";
import { currentUserId } from "@/lib/auth";
import { parseCsv } from "@/lib/validate";

/**
 * DECISION: import is atomic — any invalid row (bad month, unknown
 * category, bad amount, locked month) rejects the whole file with
 * line-numbered errors, so a partial import can never surprise the user.
 */
export async function POST(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  await db();
  const text = await req.text();

  const cats = await Category.find({ userId }).lean();
  const byName = new Map(
    cats.map((c: any) => [c.name.toLowerCase(), c._id.toString()])
  );

  const parsed = parseCsv(text, byName);
  if (!parsed.ok)
    return NextResponse.json(
      { error: "VALIDATION", message: "CSV rejected.", details: parsed.errors },
      { status: 400 }
    );

  const lockedMonths = new Set(
    (await Lock.find({ userId }).lean()).map((l: any) => l.month)
  );
  const lockedHits = parsed.rows.filter((r) => lockedMonths.has(r.month));
  if (lockedHits.length)
    return NextResponse.json(
      {
        error: "LOCKED_PERIOD",
        message: "CSV rejected: some rows target locked months.",
        details: [...new Set(lockedHits.map((r) => r.month))].map(
          (m) => `Month ${m} is locked`
        ),
      },
      { status: 423 }
    );

  const docs = await Actual.insertMany(parsed.rows.map((r) => ({ userId, ...r })));
  return NextResponse.json({ imported: docs.length }, { status: 201 });
}
