import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { Lock } from "@/models";
import { currentUserId } from "@/lib/auth";
import { monthSchema } from "@/lib/validate";
import { withErrors } from "@/lib/route";

async function handleGET() {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  await db();
  const locks = await Lock.find({ userId }).sort({ month: 1 }).lean();
  return NextResponse.json({ locks });
}

async function handlePOST(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  await db();
  const { month } = await req.json().catch(() => ({}));
  const parsed = monthSchema.safeParse(month);
  if (!parsed.success)
    return NextResponse.json(
      { error: "VALIDATION", message: parsed.error.issues[0].message },
      { status: 400 }
    );
  await Lock.updateOne(
    { userId, month: parsed.data },
    { $setOnInsert: { userId, month: parsed.data } },
    { upsert: true }
  );
  return NextResponse.json({ ok: true }, { status: 201 });
}

async function handleDELETE(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  await db();
  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month");
  await Lock.deleteOne({ userId, month });
  return NextResponse.json({ ok: true });
}

export const GET = withErrors(handleGET);
export const POST = withErrors(handlePOST);
export const DELETE = withErrors(handleDELETE);
