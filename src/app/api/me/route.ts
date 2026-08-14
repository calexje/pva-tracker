import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/auth";
import { withErrors } from "@/lib/route";
async function handleGET() {
  const userId = await currentUserId();
  return NextResponse.json({ authenticated: !!userId });
}

export const GET = withErrors(handleGET);
