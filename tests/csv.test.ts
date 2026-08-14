import { describe, it, expect } from "vitest";
import { parseCsv } from "../src/lib/validate";

/** name(lower) -> id, as the import route builds it from the user's categories. */
const cats = new Map([
  ["marketing", "cat-marketing"],
  ["payroll", "cat-payroll"],
]);

const csv = (...lines: string[]) =>
  ["month,category,amount", ...lines].join("\n") + "\n";

describe("CSV import: the brief's format", () => {
  it("accepts the sample file and converts dollars to cents", () => {
    const r = parseCsv(
      csv("2026-01,Marketing,4800", "2026-01,Payroll,20500", "2026-02,Payroll,19800"),
      cats
    );
    expect(r.ok).toBe(true);
    if (r.ok)
      expect(r.rows).toEqual([
        { categoryId: "cat-marketing", month: "2026-01", amountCents: 480000 },
        { categoryId: "cat-payroll", month: "2026-01", amountCents: 2050000 },
        { categoryId: "cat-payroll", month: "2026-02", amountCents: 1980000 },
      ]);
  });

  it("matches category names case-insensitively", () => {
    const r = parseCsv(csv("2026-01,MARKETING,10"), cats);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.rows[0].categoryId).toBe("cat-marketing");
  });

  it("requires the documented header", () => {
    const r = parseCsv("date,category,value\n2026-01,Marketing,10\n", cats);
    expect(r.ok).toBe(false);
  });
});

describe("CSV import: amount validation", () => {
  /**
   * The bug this pins: `Number("")` is 0, which is finite and non-negative, so
   * a row with no amount at all used to import silently as $0.00. A phantom
   * zero in a variance report reads as real data.
   */
  it("rejects an empty amount instead of importing zero", () => {
    const r = parseCsv(csv("2026-01,Marketing,"), cats);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatch(/Line 2/);
  });

  it("rejects a whitespace-only amount", () => {
    const r = parseCsv(csv("2026-01,Marketing,   "), cats);
    expect(r.ok).toBe(false);
  });

  it("rejects a non-numeric amount", () => {
    const r = parseCsv(csv("2026-01,Marketing,abc"), cats);
    expect(r.ok).toBe(false);
  });

  it("rejects a negative amount", () => {
    const r = parseCsv(csv("2026-01,Marketing,-100"), cats);
    expect(r.ok).toBe(false);
  });

  it("accepts an explicit zero, which is a measurement", () => {
    const r = parseCsv(csv("2026-01,Marketing,0"), cats);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.rows[0].amountCents).toBe(0);
  });
});

describe("CSV import: error reporting", () => {
  it("names the valid categories when one is unknown", () => {
    const r = parseCsv(csv("2026-01,Nonexistent,100"), cats);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors[0]).toContain("Nonexistent");
      expect(r.errors[0]).toContain("marketing");
    }
  });

  it("rejects a malformed month", () => {
    const r = parseCsv(csv("2026-13,Marketing,100"), cats);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toContain("2026-13");
  });

  /**
   * The bug this pins: blank lines are dropped before numbering, so every line
   * number after a blank one was reported one too low. Line-numbered errors are
   * the entire justification for rejecting the whole file, so they have to name
   * the line the user is actually looking at in their editor.
   */
  it("reports the real file line number when a blank line comes first", () => {
    const text = "month,category,amount\n2026-01,Marketing,100\n\n2026-13,Marketing,300\n";
    //            line 1                 line 2                 line 3  line 4
    const r = parseCsv(text, cats);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toContain("Line 4");
  });

  it("still tolerates a trailing newline and trailing blank lines", () => {
    const r = parseCsv("month,category,amount\n2026-01,Marketing,100\n\n\n", cats);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.rows).toHaveLength(1);
  });

  it("reports every bad row, not just the first", () => {
    const r = parseCsv(
      csv("2026-13,Marketing,100", "2026-01,Nonexistent,200", "2026-01,Marketing,xyz"),
      cats
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.length).toBeGreaterThanOrEqual(3);
  });
});
