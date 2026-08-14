import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/auth";
export async function GET() {
  const userId = await currentUserId();
  return NextResponse.json({ authenticated: !!userId });
}
