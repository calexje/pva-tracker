import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";

const COOKIE = "pva_session";
/**
 * The JWT signing key. A missing SESSION_SECRET is fatal in production rather
 * than silently falling back: the fallback string is committed to a public
 * repository, so signing real sessions with it would let anyone forge a cookie
 * for any userId. Checked per call rather than at module load so that
 * `next build` still succeeds without a configured environment.
 */
const secret = () => {
  const value = process.env.SESSION_SECRET;
  if (!value) {
    if (process.env.NODE_ENV === "production")
      throw new Error(
        "SESSION_SECRET is not set; refusing to sign or verify sessions with the development fallback."
      );
    return new TextEncoder().encode("dev-only-secret");
  }
  return new TextEncoder().encode(value);
};

export const hashPassword = (pw: string) => bcrypt.hash(pw, 10);
export const verifyPassword = (pw: string, hash: string) =>
  bcrypt.compare(pw, hash);

export async function createSession(userId: string) {
  const token = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("7d")
    .sign(secret());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function destroySession() {
  (await cookies()).delete(COOKIE);
}

/** Returns the authenticated userId or null. Every API route calls this. */
export async function currentUserId(): Promise<string | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  // Resolved outside the try: a misconfigured secret must surface as a 500 via
  // withErrors, not be swallowed into an anonymous 401.
  const key = secret();
  try {
    const { payload } = await jwtVerify(token, key);
    return (payload.sub as string) ?? null;
  } catch {
    return null;
  }
}
