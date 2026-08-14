import { describe, it, expect } from "vitest";
import {
  varianceCents,
  variancePct,
  buildReport,
  monthsBetween,
  type ReportInput,
} from "../src/lib/variance";

/**
 * Pinned to the assignment's sample table:
 *
 *  Month    Category   Plan    Actual  Variance  Variance %
 *  2026-01  Marketing  5,000   4,800   −200      −4.00%
 *  2026-01  Payroll    20,000  20,500  +500      +2.50%
 *  2026-02  Marketing  5,000   —       —         —        (missing-actual policy: dash)
 *  2026-02  Payroll    20,000  19,800  −200      −1.00%
 */
const sample: ReportInput[] = [
  { month: "2026-01", categoryId: "m", categoryName: "Marketing", planCents: 500000, actualCents: 480000 },
  { month: "2026-01", categoryId: "p", categoryName: "Payroll", planCents: 2000000, actualCents: 2050000 },
  { month: "2026-02", categoryId: "m", categoryName: "Marketing", planCents: 500000, actualCents: null },
  { month: "2026-02", categoryId: "p", categoryName: "Payroll", planCents: 2000000, actualCents: 1980000 },
];

describe("sample table from the brief", () => {
  it("matches every row", () => {
    const { rows } = buildReport(sample);
    const find = (mo: string, cat: string) =>
      rows.find((r) => r.month === mo && r.categoryName === cat)!;

    const janMkt = find("2026-01", "Marketing");
    expect(janMkt.varianceCents).toBe(-20000);
    expect(janMkt.variancePct).toBe(-4);

    const janPay = find("2026-01", "Payroll");
    expect(janPay.varianceCents).toBe(50000);
    expect(janPay.variancePct).toBe(2.5);

    const febMkt = find("2026-02", "Marketing");
    expect(febMkt.varianceCents).toBeNull(); // dash policy
    expect(febMkt.variancePct).toBeNull();

    const febPay = find("2026-02", "Payroll");
    expect(febPay.varianceCents).toBe(-20000);
    expect(febPay.variancePct).toBe(-1);
  });

  it("range totals sum present values only", () => {
    const { totals } = buildReport(sample);
    expect(totals.planCents).toBe(500000 + 2000000 + 500000 + 2000000);
    expect(totals.actualCents).toBe(480000 + 2050000 + 1980000);
    expect(totals.monthlyNetVariance).toEqual([
      { month: "2026-01", varianceCents: 30000, unallocatedCents: 0 },
      { month: "2026-02", varianceCents: -20000, unallocatedCents: 500000 },
    ]);
    expect(totals.unallocatedCents).toBe(500000);
  });
});

describe("unallocated plan: an absence of data is not zero spend", () => {
  it("routes a missing actual to unallocated, never to variance", () => {
    const noRecord = buildReport([
      { month: "2026-04", categoryId: "m", categoryName: "Marketing", planCents: 500000, actualCents: null },
    ]);
    expect(noRecord.totals.monthlyNetVariance).toEqual([
      { month: "2026-04", varianceCents: 0, unallocatedCents: 500000 },
    ]);
    expect(noRecord.totals.unallocatedCents).toBe(500000);
  });

  it("an actual of 0 is a measurement, not an absence", () => {
    const spentNothing = buildReport([
      { month: "2026-04", categoryId: "m", categoryName: "Marketing", planCents: 500000, actualCents: 0 },
    ]);
    expect(spentNothing.totals.monthlyNetVariance).toEqual([
      { month: "2026-04", varianceCents: -500000, unallocatedCents: 0 },
    ]);
    expect(spentNothing.totals.unallocatedCents).toBe(0);
  });

  it("a zero plan with no actual contributes nothing to either series", () => {
    const { totals } = buildReport([
      { month: "2026-04", categoryId: "t", categoryName: "Tools", planCents: 0, actualCents: null },
    ]);
    expect(totals.monthlyNetVariance).toEqual([
      { month: "2026-04", varianceCents: 0, unallocatedCents: 0 },
    ]);
  });

  /**
   * The guard rail. The two stacked series must decompose the footer variance
   * exactly:  Σ(variance) − Σ(unallocated) === totals.varianceCents
   * This is the assertion whose absence let the chart and the totals row
   * disagree by the value of one unlogged plan.
   */
  it("the stacked series reconcile to totals.varianceCents", () => {
    const { totals } = buildReport(sample);
    const stacked = totals.monthlyNetVariance.reduce(
      (sum, m) => sum + m.varianceCents - m.unallocatedCents,
      0
    );
    expect(stacked).toBe(totals.varianceCents);
  });

  it("reconciles on a mixed range (no-plan row, second unallocated month)", () => {
    const mixed: ReportInput[] = [
      ...sample,
      { month: "2026-03", categoryId: "t", categoryName: "Tools", planCents: null, actualCents: 9900 },
      { month: "2026-03", categoryId: "m", categoryName: "Marketing", planCents: 300000, actualCents: null },
    ];
    const { totals } = buildReport(mixed);
    const stacked = totals.monthlyNetVariance.reduce(
      (sum, m) => sum + m.varianceCents - m.unallocatedCents,
      0
    );
    expect(stacked).toBe(totals.varianceCents);
    expect(totals.unallocatedCents).toBe(500000 + 300000);
  });
});

describe("edge cases the brief calls out", () => {
  it("plan = 0 gives null variance % (no NaN, no Infinity)", () => {
    expect(variancePct(0, 12345)).toBeNull();
    expect(variancePct(null, 12345)).toBeNull();
  });

  it("plan = 0 still gives a numeric variance", () => {
    expect(varianceCents(0, 12345)).toBe(12345);
    expect(varianceCents(null, 12345)).toBe(12345);
  });

  it("missing actual is null across the board", () => {
    expect(varianceCents(500000, null)).toBeNull();
    expect(variancePct(500000, null)).toBeNull();
  });

  it("actual with no plan row appears with null plan", () => {
    const { rows } = buildReport([
      { month: "2026-03", categoryId: "t", categoryName: "Tools", planCents: null, actualCents: 9900 },
    ]);
    expect(rows[0].varianceCents).toBe(9900);
    expect(rows[0].variancePct).toBeNull();
  });

  it("rounds variance % to 2dp", () => {
    // 1/3 over plan: 33.333...%
    expect(variancePct(30000, 40000)).toBe(33.33);
  });
});

describe("month helpers", () => {
  it("enumerates a quarter", () => {
    expect(monthsBetween("2026-01", "2026-03")).toEqual(["2026-01", "2026-02", "2026-03"]);
  });
  it("crosses a year boundary", () => {
    expect(monthsBetween("2025-11", "2026-02")).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });
});
