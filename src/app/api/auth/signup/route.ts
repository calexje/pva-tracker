import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { User } from "@/models";
import { signupSchema } from "@/lib/validate";
import { hashPassword, createSession } from "@/lib/auth";

export async function POST(req: NextRequest) {
  await db();
  const body = await req.json().catch(() => ({}));
  const parsed = signupSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      { error: "VALIDATION", message: parsed.error.issues[0].message },
      { status: 400 }
    );
  const { email, password } = parsed.data;
  if (await User.exists({ email: email.toLowerCase() }))
    return NextResponse.json(
      { error: "EMAIL_TAKEN", message: "An account with this email already exists." },
      { status: 409 }
    );
  const user = await User.create({
    email,
    passwordHash: await hashPassword(password),
  });
  await createSession(user._id.toString());
  return NextResponse.json({ ok: true }, { status: 201 });
}
