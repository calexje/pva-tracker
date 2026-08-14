import { NextResponse } from "next/server";
import { destroySession } from "@/lib/auth";
import { withErrors } from "@/lib/route";
async function handlePOST() {
  await destroySession();
  return NextResponse.json({ ok: true });
}

export const POST = withErrors(handlePOST);
