import "./globals.css";
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUserId, destroySession } from "@/lib/auth";

export const metadata = {
  title: "Plan vs Actual Tracker",
  description: "Monthly targets, actual spend, variance reporting with locked periods.",
};

/**
 * Reading the session here makes every page dynamic, which is correct: the nav
 * depends on who is asking. A server action rather than a fetch, so logging out
 * works without client-side JavaScript.
 */
async function logout() {
  "use server";
  await destroySession();
  redirect("/login");
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const signedIn = Boolean(await currentUserId());

  return (
    <html lang="en">
      <body>
        <nav>
          <strong>Plan vs Actual</strong>
          <Link href="/">Report</Link>
          <Link href="/manage">Manage data</Link>
          <span className="spacer" />
          {signedIn ? (
            <form action={logout}>
              <button type="submit" className="navlink">
                Log out
              </button>
            </form>
          ) : (
            <>
              <Link href="/login">Log in</Link>
              <Link href="/signup">Sign up</Link>
            </>
          )}
        </nav>
        <main>{children}</main>
      </body>
    </html>
  );
}
