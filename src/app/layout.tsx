import "./globals.css";
import Link from "next/link";

export const metadata = {
  title: "Plan vs Actual Tracker",
  description: "Monthly targets, actual spend, variance reporting with locked periods.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav>
          <strong>Plan vs Actual</strong>
          <Link href="/">Report</Link>
          <Link href="/manage">Manage data</Link>
          <span className="spacer" />
          <Link href="/login">Log in</Link>
          <Link href="/signup">Sign up</Link>
        </nav>
        <main>{children}</main>
      </body>
    </html>
  );
}
