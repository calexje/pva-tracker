/**
 * Pure calculation module for plan-vs-actual reporting.
 * All money values are integer cents to avoid floating-point drift.
 *
 * DECISIONS (documented in README):
 * - Missing actual: displayed as "—" (null here). It is NOT treated as 0
 *   per-row; range totals sum only present values (arithmetically
 *   equivalent to 0, but per-row display stays honest).
 * - Plan = 0: variancePct is null (rendered as "N/A") — never NaN/Infinity.
 * - Variance sign: actual − plan. Negative = under plan.
 */

export interface ReportInput {
  month: string; // YYYY-MM
  categoryId: string;
  categoryName: string;
  planCents: number | null;
  actualCents: number | null;
}

export interface ReportRow {
  month: string;
  categoryId: string;
  categoryName: string;
  planCents: number | null;
  actualCents: number | null;
  varianceCents: number | null;
  variancePct: number | null; // percentage, e.g. -4 means -4.00%
}

export interface ReportTotals {
  planCents: number;
  actualCents: number;
  varianceCents: number;
  unallocatedCents: number;
  monthlyNetVariance: {
    month: string;
    varianceCents: number;
    unallocatedCents: number;
  }[];
}



/** Variance in cents: actual − plan. Null when actual is missing. */
export function varianceCents(
  planCents: number | null,
  actualCents: number | null
): number | null {
  if (actualCents === null) return null;
  const plan = planCents ?? 0;
  return actualCents - plan;
}

/**
 * Variance % = (actual − plan) / plan × 100.
 * Null when actual is missing OR plan is null/0 (no NaN, no Infinity).
 * Rounded to 2 decimal places.
 */
export function variancePct(
  planCents: number | null,
  actualCents: number | null
): number | null {
  if (actualCents === null) return null;
  if (planCents === null || planCents === 0) return null;
  const pct = ((actualCents - planCents) / planCents) * 100;
  return Math.round(pct * 100) / 100;
}

export function buildRow(input: ReportInput): ReportRow {
  return {
    ...input,
    varianceCents: varianceCents(input.planCents, input.actualCents),
    variancePct: variancePct(input.planCents, input.actualCents),
  };
}

/** Inclusive YYYY-MM range check — lexicographic compare is safe for this format. */
export function monthInRange(month: string, from: string, to: string): boolean {
  return month >= from && month <= to;
}

/** Every YYYY-MM between from and to inclusive. */
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let [y, m] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

/**
 * Assemble the full report: one row per (category × month) that has a plan
 * or an actual, sorted by month then category name. Totals sum present
 * values only.
 */
export function buildReport(inputs: ReportInput[]): {
  rows: ReportRow[];
  totals: ReportTotals;
} {
  const rows = inputs
    .map(buildRow)
    .sort(
      (a, b) =>
        a.month.localeCompare(b.month) ||
        a.categoryName.localeCompare(b.categoryName)
    );

  const byMonth = new Map<string, {varianceCents: number; unallocatedCents: number}>();
  let planCents = 0;
  let actualCents = 0;
  for (const r of rows) {
    planCents += r.planCents ?? 0;
    actualCents += r.actualCents ?? 0;

    const entry =
      byMonth.get(r.month) ?? { varianceCents: 0, unallocatedCents: 0 };
    entry.varianceCents += r.varianceCents ?? 0;
    // A plan with no actual record is unallocated, not an underspend. The test
    // is `=== null`, not falsiness: an actual of 0 is a measurement, and the
    // two are different statements about the month.
    entry.unallocatedCents += r.actualCents === null ? (r.planCents ?? 0) : 0;
    byMonth.set(r.month, entry);
  }

  return {
    rows,
    totals: {
      planCents,
      actualCents,
      varianceCents: actualCents - planCents,
      unallocatedCents: [...byMonth.values()].reduce(
        (sum, m) => sum + m.unallocatedCents,
        0
      ),
      monthlyNetVariance: [...byMonth.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([month, v]) => ({ month, ...v })),
    },
  };
}
