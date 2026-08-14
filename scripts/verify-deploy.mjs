/**
 * End-to-end verification of the product rules that cannot be unit-tested,
 * run against a live instance over HTTP.
 *
 *   node scripts/verify-deploy.mjs                        # localhost:3000
 *   node scripts/verify-deploy.mjs https://your-app.app   # a deployment
 *
 * Covers the three areas the brief names but the Vitest suites can't reach,
 * because they live in route handlers rather than in pure modules:
 * server-side lock enforcement, per-user data isolation, and CSV validation.
 *
 * Side effects, by design — this exercises real writes:
 *   - creates (or reuses) the account below, and leaves it in place; there is
 *     no delete endpoint in scope
 *   - within that account only: one category, plans for 2026-01 and 2026-04,
 *     a couple of actuals, and a lock on 2026-01 that is released before exit
 *   - reads, but never writes, the demo account
 *
 * Exits non-zero if any check fails, so it can gate a deploy.
 */

const BASE = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const DEMO_EMAIL = process.env.DEMO_EMAIL ?? "demo@example.com";
const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? "password123";

const TEST_EMAIL = "verify-deploy@example.com";
const TEST_PASSWORD = "verify-deploy-pw-123";

/** One cookie jar per named session, so two users can be driven at once. */
const jars = {};

async function call(session, method, path, body, contentType = "application/json") {
  const headers = {};
  if (jars[session]) headers.Cookie = jars[session];
  if (body !== undefined) headers["Content-Type"] = contentType;

  const res = await fetch(BASE + path, {
    method,
    headers,
    body:
      body === undefined
        ? undefined
        : contentType === "application/json"
          ? JSON.stringify(body)
          : body,
  });

  for (const cookie of res.headers.getSetCookie?.() ?? []) {
    const pair = cookie.split(";")[0];
    if (pair.startsWith("pva_session=") && !pair.endsWith("=")) jars[session] = pair;
  }

  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* a non-JSON body is itself a finding — see the error-shape check */
  }
  return { status: res.status, json, text };
}

const results = [];
function check(name, passed, detail) {
  results.push({ name, passed });
  console.log(`${passed ? "  ok  " : " FAIL "} ${name}`);
  console.log(`        ${detail}`);
}

console.log(`\nVerifying ${BASE}\n${"-".repeat(60)}`);

// ---------------------------------------------------------------- setup -----
let r = await call("test", "POST", "/api/auth/signup", {
  email: TEST_EMAIL,
  password: TEST_PASSWORD,
});
if (r.status === 409)
  r = await call("test", "POST", "/api/auth/login", {
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });
if (r.status >= 400) {
  console.error(`\nCannot establish a test session: ${r.status} ${r.text}`);
  process.exit(1);
}

r = await call("test", "POST", "/api/categories", { name: "Marketing" });
let categoryId = r.json?.category?._id;
if (!categoryId) {
  const list = await call("test", "GET", "/api/categories");
  categoryId = list.json?.categories?.find((c) => c.name === "Marketing")?._id;
}
if (!categoryId) {
  console.error("\nCannot resolve a category for the test account.");
  process.exit(1);
}

await call("test", "PUT", "/api/plans", { categoryId, month: "2026-01", amountCents: 500000 });
await call("test", "POST", "/api/actuals", { categoryId, month: "2026-01", amountCents: 480000 });

// ------------------------------------------- 1. lock enforcement (server) ---
await call("test", "POST", "/api/locks", { month: "2026-01" });

r = await call("test", "PUT", "/api/plans", { categoryId, month: "2026-01", amountCents: 999999 });
check(
  "locked month rejects a plan upsert with 423",
  r.status === 423 && r.json?.error === "LOCKED_PERIOD",
  `${r.status} ${JSON.stringify(r.json)}`
);

r = await call("test", "POST", "/api/actuals", { categoryId, month: "2026-01", amountCents: 1 });
check(
  "locked month rejects a new actual with 423",
  r.status === 423 && r.json?.error === "LOCKED_PERIOD",
  `${r.status} ${JSON.stringify(r.json)}`
);

r = await call(
  "test",
  "POST",
  "/api/actuals/import",
  "month,category,amount\n2026-01,Marketing,50\n",
  "text/plain"
);
check(
  "locked month rejects a CSV import with 423",
  r.status === 423 && r.json?.error === "LOCKED_PERIOD",
  `${r.status} ${JSON.stringify(r.json)}`
);

// A 423 is only meaningful if the stored value really is untouched.
r = await call("test", "GET", "/api/plans?from=2026-01&to=2026-01");
const stored = r.json?.plans?.find((p) => p.month === "2026-01")?.amountCents;
check(
  "the rejected write left the stored plan unchanged",
  stored === 500000,
  `amountCents = ${stored} (500000 = the pre-lock value)`
);

await call("test", "DELETE", "/api/locks?month=2026-01");

// ------------------------------------------------ 2. per-user isolation -----
await call("demo", "POST", "/api/auth/login", { email: DEMO_EMAIL, password: DEMO_PASSWORD });
const demoCats = await call("demo", "GET", "/api/categories");
const demoIds = new Set((demoCats.json?.categories ?? []).map((c) => c._id));

const testReport = await call("test", "GET", "/api/report?from=2026-01&to=2026-03");
const leaked = (testReport.json?.rows ?? []).filter((row) => demoIds.has(row.categoryId));
check(
  "one account's report contains none of another's rows",
  demoIds.size > 0 && leaked.length === 0,
  `${demoIds.size} demo categories, ${leaked.length} leaked into the test account's report`
);

// Names collide across accounts (both have "Marketing"); ids must not.
r = await call("test", "PUT", "/api/plans", {
  categoryId: [...demoIds][0],
  month: "2026-05",
  amountCents: 123456,
});
check(
  "writing a plan against another account's categoryId is refused",
  r.status === 404,
  `${r.status} ${JSON.stringify(r.json)}`
);

// ----------------------------------------------- 3. CSV validation rules ----
const before = await call("test", "GET", "/api/actuals?from=2026-01&to=2026-12");
const beforeCount = before.json?.actuals?.length;

r = await call(
  "test",
  "POST",
  "/api/actuals/import",
  // line 2 is valid; line 3 has an unknown category; line 5 a bad month —
  // and line 4 is blank, so the reported numbers prove blanks don't shift them
  "month,category,amount\n2026-03,Marketing,100\n2026-03,Nonexistent,200\n\n2026-13,Marketing,300\n",
  "text/plain"
);
const details = r.json?.details ?? [];
check(
  "one bad row rejects the whole file, with line numbers",
  r.status === 400 && details.some((d) => /Line \d+/.test(d)),
  `${r.status} ${JSON.stringify(details)}`
);
check(
  "line numbers survive a blank line (line 5, not line 4)",
  details.some((d) => d.includes("Line 5")),
  `${JSON.stringify(details)}`
);

const after = await call("test", "GET", "/api/actuals?from=2026-01&to=2026-12");
check(
  "nothing from the rejected file was written",
  beforeCount === after.json?.actuals?.length,
  `actuals before = ${beforeCount}, after = ${after.json?.actuals?.length}`
);

// --------------------------------------------- 4. plan = 0 arithmetic -------
await call("test", "PUT", "/api/plans", { categoryId, month: "2026-04", amountCents: 0 });
await call("test", "POST", "/api/actuals", { categoryId, month: "2026-04", amountCents: 12345 });
r = await call("test", "GET", "/api/report?from=2026-04&to=2026-04");
const zeroPlanRow = (r.json?.rows ?? []).find((row) => row.month === "2026-04");
check(
  "plan = 0 yields a null variance %, not NaN or Infinity",
  zeroPlanRow?.variancePct === null && typeof zeroPlanRow?.varianceCents === "number",
  `variancePct = ${JSON.stringify(zeroPlanRow?.variancePct)}, varianceCents = ${zeroPlanRow?.varianceCents}`
);
check(
  "no NaN or Infinity anywhere in the report payload",
  !/\bNaN\b|\bInfinity\b/.test(r.text),
  `payload is ${/\bNaN\b|\bInfinity\b/.test(r.text) ? "CONTAMINATED" : "clean"}`
);

// ------------------------------- 5. every domain route demands a session ----
const guarded = [
  ["GET", "/api/report?from=2026-01&to=2026-01"],
  ["GET", "/api/plans?from=2026-01&to=2026-01"],
  ["PUT", "/api/plans"],
  ["GET", "/api/actuals?from=2026-01&to=2026-01"],
  ["POST", "/api/actuals"],
  ["GET", "/api/categories"],
  ["POST", "/api/categories"],
  ["GET", "/api/locks"],
  ["POST", "/api/locks"],
  ["POST", "/api/actuals/import"],
];
const unguarded = [];
for (const [method, path] of guarded) {
  const res = await call("anonymous", method, path, method === "GET" ? undefined : {});
  if (res.status !== 401 || res.json?.error !== "UNAUTHENTICATED")
    unguarded.push(`${method} ${path} -> ${res.status}`);
}
check(
  "every domain route rejects an anonymous caller with 401",
  unguarded.length === 0,
  unguarded.length ? unguarded.join("; ") : `${guarded.length}/${guarded.length} returned 401 UNAUTHENTICATED`
);

// ------------------------------------------------------------- summary ------
const passed = results.filter((x) => x.passed).length;
console.log(`${"-".repeat(60)}\n${passed}/${results.length} checks passed\n`);

if (passed !== results.length) {
  console.error("Failed: " + results.filter((x) => !x.passed).map((x) => x.name).join(", "));
  process.exit(1);
}
