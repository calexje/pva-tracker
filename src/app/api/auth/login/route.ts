import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { User } from "@/models";
import { verifyPassword, createSession } from "@/lib/auth";
import { withErrors } from "@/lib/route";

async function handlePOST(req: NextRequest) {
  await db();
  const { email, password } = await req.json().catch(() => ({}));
  const user = email && (await User.findOne({ email: String(email).toLowerCase() }));
  if (!user || !(await verifyPassword(String(password ?? ""), user.passwordHash)))
    return NextResponse.json(
      { error: "BAD_CREDENTIALS", message: "Email or password is incorrect." },
      { status: 401 }
    );
  await createSession(user._id.toString());
  return NextResponse.json({ ok: true });
}

export const POST = withErrors(handlePOST);
