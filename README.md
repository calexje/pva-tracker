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
6. `npm test` — the calculation and CSV suites (see **Tests** below).
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
  It is *not* treated as 0 per row. This is the brief's second permitted
  option. How the aggregates treat it is the subject of the next section.

## Unallocated plan — an absence of data is not zero spend

A category-month with a target and no actual *record* is **unallocated**:
budgeted money that hasn't been accounted for yet. It is never reported as a
variance. The report keeps four distinct statements apart:

| Statement | How it appears |
| --- | --- |
| We spent more than planned | positive variance (red) |
| We spent less than planned | negative variance (green) |
| We don't know what we spent | unallocated (grey) |
| We spent nothing | an actual of `0` → negative variance, **not** unallocated |

The test is a strict `actualCents === null`, never a falsy check, because `0`
is falsy in JavaScript and a logged zero is a measurement rather than a gap.

- The monthly chart is a **stacked bar** — variance plus unallocated — so a
  bar's height is the month's net position against plan while the grey segment
  reads as "not yet accounted for" instead of as a saving.
- The totals row shows the combined figure and names the split directly beneath
  the table ("of the range total, X is unallocated plan"), so no aggregate
  silently reports absent data as a zero.
- An invariant is asserted in the suite:
  `Σ(monthly variance) − Σ(monthly unallocated) === totals.varianceCents`.
  Without that assertion the chart and the totals row can disagree — and they
  did, by the value of one unlogged target, until it was added.
- Logging an actual of `0` against an unallocated cell moves money out of
  unallocated and into variance while leaving the range total unchanged. The
  total was never in question; only its explanation was.

On the sample data, 2026-02 renders Payroll's −$200 variance and Marketing's
$5,000 unallocated target as two segments of a single bar.

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

**Decision: import is atomic.** Every row is validated before any row is
written, so one bad row rejects the whole file with line-numbered errors and
nothing is inserted. A partial import can silently skew a report; a rejected
file with exact line numbers is fixable in seconds.

**Format constraint.** The parser splits on commas with no quoted-field
support, which is all the brief's format requires. The consequence is that a
category name containing a comma could never be imported — the row would split
into four fields and fail with "expected 3 fields", an error that tells the
user nothing useful. Category creation therefore rejects commas up front, with
a message that explains why. RFC 4180 quoting is in *What I'd improve*.

To be precise about the guarantee: validation is what makes it atomic, not the
write. The insert is `insertMany`, not a transaction, so the promise is "no row
is written until every row has passed validation" rather than "the write itself
is all-or-nothing". Wrapping it in a Mongo session is the production answer —
see *What I'd improve*.

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
list, negative amounts, locked period). Every handler is wrapped so that even
an *unexpected* failure keeps that shape rather than returning an empty body:
an unreachable database is `503 DATABASE_UNAVAILABLE`, anything else
unforeseen is `500 INTERNAL`.

**Login deliberately returns `401 BAD_CREDENTIALS` for every failure** —
unknown address, wrong password, or malformed body alike. A `400` on a
malformed email would confirm that the format was the problem, and a distinct
code for an unknown address would let an attacker enumerate registered users.
Every other endpoint validates with zod and returns `400 VALIDATION`; this one
is the deliberate exception.

## Tests

`npm test` — two Vitest suites, both over pure modules with no I/O and no
framework imports, so the highest-value logic is tested in isolation.

- **`tests/variance.test.ts`** — the calculation module, pinned to the brief's
  sample table row by row, plus plan=0, missing actual, actual with no plan
  row, 2dp rounding, year-boundary month enumeration, the unallocated
  classification (`null` versus a logged `0`), and the reconciliation invariant
  between the chart series and the range total.
- **`tests/csv.test.ts`** — import parsing: dollars to cents, case-insensitive
  category matching, header validation, amount validation (empty, whitespace,
  non-numeric, negative, and an explicit zero, which is valid), and
  line-numbered error reporting including line numbers after a blank line.

Lock enforcement and per-user scoping are verified against the deployed API
rather than in the suite — locked-month `PUT`/`POST`/import all rejected with
423 and the stored value confirmed unchanged, a second account unable to read
or write the first's data, a one-bad-row CSV rejected in full, and a plan of
zero rendering without `NaN`. Promoting those into automated tests is the first
item under *What I'd improve*.

## Assumptions & tradeoffs

- Category CRUD is create-only (no rename/delete) — assignment scope; the
  report handles a deleted-category edge defensively regardless. Because there
  is no rename path, the comma restriction only needs enforcing at creation.
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
- Transactional lock-check-and-write, and a transactional CSV insert (Mongo
  sessions), closing both the lock race and the partial-write window.
- Rollup collection for report aggregation at scale (see Indexing).
- Category rename/merge with referential handling; actual entry edit/delete
  with history.
- E2E tests (Playwright) over the lock-enforcement and scoping paths.
- CSV: RFC 4180 quoted-field parsing, which would lift the comma restriction
  on category names; plus file upload and a preview-before-commit flow.

## AI tooling

Built with AI-assisted tooling as an accelerant, consistent with how I work
day to day; all design decisions (locking granularity, missing-actual policy,
atomic import, cents-based money, schema and indexes) are mine and I'm happy
to defend any line of it.
