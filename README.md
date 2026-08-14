# Plan vs Actual Tracker

Monthly spending targets per category, logged actuals, and a variance report
with locked (read-only) periods. Built for the CrossVal take-home assignment.

**Live URL:** https://pva-tracker.vercel.app

**Demo login:** `demo@example.com` / `password123` — pre-loaded with the
brief's sample data, including the deliberately unlogged Marketing 2026-02
cell so the unallocated case is visible on the first screen.

## Stack

Next.js 16 (App Router) · TypeScript · MongoDB (Mongoose) · Vitest · Recharts.
Deployed on Vercel with MongoDB Atlas. Chosen to mirror CrossVal's own
Node/TypeScript/MongoDB stack.

## Setup

1. Prerequisites: Node 20+, a MongoDB connection string (Atlas free tier works).
2. `cp .env.example .env` and fill in:
   - `MONGODB_URI` — your connection string, **including the database name in
     the path** (`...mongodb.net/pva-tracker?...`). Atlas's connect dialog omits
     it; without it every collection lands in a database called `test`.
   - `SESSION_SECRET` — any long random string
3. `npm install`
4. `node --env-file=.env scripts/seed.mjs` — creates the demo account above and
   loads the brief's sample data. (`npm run seed` runs plain Node, which does
   not read `.env`, so pass the flag or prefix `MONGODB_URI=` inline.)
5. `npm run dev` → http://localhost:3000
6. `npm test` — the calculation test suite (pinned to the brief's sample table).
7. `npx tsc --noEmit` — type-check; this is what the production build runs.

Or sign up fresh, add categories (e.g. Marketing, Payroll), set targets, log
actuals or paste the sample CSV under **Manage data → CSV import**, then run
the report.

## Calculation & rounding policy

All money is stored and computed as **integer cents** — no floating-point
drift. Amounts are converted to cents at the API boundary and formatted for
display only at the UI edge.

- **Variance** = actual − plan (cents). Negative = under plan.
- **Variance %** = (actual − plan) / plan × 100, rounded to 2 decimal places.

Worked example (from the brief's sample): Marketing 2026-01, plan $5,000
(500000¢), actual $4,800 (480000¢) → variance −20000¢ = **−$200**, variance %
= (−20000 / 500000) × 100 = **−4.00%**.

### Edge cases (as required by the brief)

- **Plan = 0 (or no plan row):** variance % is rendered as **—** (null in the
  API). No NaN, no Infinity. The absolute variance is still shown.
- **Missing actual:** rendered as **—** for Actual, Variance, and Variance %.
  It is *not* treated as 0 per row. Range totals sum recorded values only
  (arithmetically equivalent to treating missing as 0 in aggregate, while
  keeping per-row display honest). This matches the brief's second permitted
  option and is applied consistently everywhere.

## Locking behavior

- **Granularity: month** (per user). One lock document per (user, month).
- Locking a month makes both **plans and actuals** for it read-only.
- Enforcement is **server-side**: the plans upsert, actuals create, and CSV
  import endpoints all check the lock and reject with **HTTP 423 (Locked)**
  and a machine-readable error code plus a human message —
  `{"error":"LOCKED_PERIOD","message":"Period 2026-01 is locked. Unlock it before editing plans or actuals."}`
  The UI also greys locked rows and pills them, but the API is the boundary.
- Unlocking is allowed (locks are a user-facing control, not an audit ledger —
  see *What I'd improve* for the production version).

## CSV import

Format per the brief: `month,category,amount` with header. Validation covers
month format (YYYY-MM), category names (against the user's categories, with
the valid list echoed in the error), amount parsing, and locked months.

**Decision: import is atomic.** Any invalid row rejects the entire file with
line-numbered errors. A partial import can silently skew a report; a rejected
file with exact line numbers is fixable in seconds.

## Data model

Collections: `users`, `categories`, `plans`, `actuals`, `locks`. Every domain
document carries `userId` and **every query filters on it** — users can only
see and modify their own data (enforced in each route handler, not the UI).

- `plans`: unique compound index `(userId, categoryId, month)` — targets are
  upserts.
- `actuals`: append-style log; multiple entries per category-month are allowed
  and **summed at report time** via aggregation.
- `locks`: presence = locked; unique `(userId, month)`.

### Indexing / scale

Current compound indexes serve the two hot paths: report range scans
(`userId + month` prefix) and plan upserts (`userId + categoryId + month`).
At scale I would additionally: pre-aggregate actuals per category-month into a
materialized rollup collection updated on write (reports become a single
indexed range read), and cap the report range or paginate by month. The
report endpoint already aggregates in the database rather than in Node.

## API overview

| Method | Path | Notes |
| --- | --- | --- |
| POST | /api/auth/signup, /login, /logout | Session = signed httpOnly JWT cookie |
| GET/POST | /api/categories | Per-user; duplicate names rejected (409) |
| GET/PUT | /api/plans | PUT = upsert target; 423 when month locked |
| GET/POST | /api/actuals | 423 when month locked |
| POST | /api/actuals/import | text/plain CSV body; atomic; 400/423 with line-numbered `details` |
| GET/POST/DELETE | /api/locks | Lock/unlock a month |
| GET | /api/report?from&to | Rows + totals + monthly net variance + locked months |

Errors are consistent: `{ error: CODE, message: human_text, details?: [] }`
with specific messages (invalid month format, unknown category with valid
list, negative amounts, locked period).

## Tests

`npm test` — Vitest suite on the pure calculation module
(`src/lib/variance.ts`), pinned to the brief's sample table row-by-row,
plus the plan=0, missing-actual, no-plan-row, rounding, and year-boundary
cases. The calculation module has no I/O and no framework imports, so the
highest-value logic is tested in isolation.

## Assumptions & tradeoffs

- Category CRUD is create-only (no rename/delete) — assignment scope; the
  report handles a deleted-category edge defensively regardless.
- Actuals are append-only entries (no edit/delete in scope); corrections can
  be handled by an offsetting entry. In production I'd add edit with an audit
  trail.
- Session auth is a signed JWT in an httpOnly cookie (7-day expiry) rather
  than a session store — appropriate for the scope, swap for server-side
  sessions if revocation matters.
- Lock checks and writes are two steps, not a transaction; a concurrent
  lock+write race is theoretically possible. In production: a transaction, or
  a `lockVersion` check on write.

## What I'd improve before production

- Rate limiting and account lockout on auth endpoints.
- Audit log for lock/unlock and data mutations (locks as append-only ledger).
- Transactional lock-check-and-write (Mongo sessions).
- Rollup collection for report aggregation at scale (see Indexing).
- Category rename/merge with referential handling; actual entry edit/delete
  with history.
- E2E tests (Playwright) over the lock-enforcement and scoping paths.
- CSV: file upload + preview-before-commit flow.

## AI tooling

Built with AI-assisted tooling as an accelerant, consistent with how I work
day to day; all design decisions (locking granularity, missing-actual policy,
atomic import, cents-based money, schema and indexes) are mine and I'm happy
to defend any line of it.
