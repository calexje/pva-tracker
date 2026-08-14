import { z } from "zod";

export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export const monthSchema = z
  .string()
  .regex(MONTH_RE, "Month must be in YYYY-MM format");

export const signupSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const categorySchema = z.object({
  // No commas: the CSV import format is comma-delimited with no quoted-field
  // support, so a category whose name contained one could never be imported.
  // Rejecting it at creation is honest; accepting it and failing at import
  // time with "expected 3 fields" would not be.
  name: z
    .string()
    .trim()
    .min(1, "Category name is required")
    .max(60)
    .refine((n) => !n.includes(","), {
      message:
        "Category names cannot contain a comma, because the CSV import format is comma-delimited.",
    }),
});

export const planSchema = z.object({
  categoryId: z.string().min(1),
  month: monthSchema,
  amountCents: z
    .number()
    .int("Amount must resolve to whole cents")
    .min(0, "Plan amount cannot be negative"),
});

export const actualSchema = z.object({
  categoryId: z.string().min(1),
  month: monthSchema,
  amountCents: z.number().int().min(0, "Actual amount cannot be negative"),
  note: z.string().max(500).optional(),
});

export const rangeSchema = z
  .object({ from: monthSchema, to: monthSchema })
  .refine((r) => r.from <= r.to, { message: "'from' must be <= 'to'" });

/** Parse the assignment's CSV format: month,category,amount (header required). */
export function parseCsv(
  text: string,
  validCategories: Map<string, string> // name(lower) -> id
):
  | { ok: true; rows: { categoryId: string; month: string; amountCents: number }[] }
  | { ok: false; errors: string[] } {
  const lines = text.split(/\r?\n/).map((l) => l.trim());

  // Blank lines are skipped, never filtered out: dropping them before
  // numbering would shift every line number after the first blank, and
  // line-numbered errors are the whole justification for rejecting the file.
  const headerIndex = lines.findIndex((l) => l !== "");
  if (headerIndex === -1) return { ok: false, errors: ["CSV is empty"] };

  const header = lines[headerIndex].toLowerCase().replace(/\s/g, "");
  if (header !== "month,category,amount")
    return {
      ok: false,
      errors: [
        `Header must be "month,category,amount" (got "${lines[headerIndex]}")`,
      ],
    };

  const errors: string[] = [];
  const rows: { categoryId: string; month: string; amountCents: number }[] = [];

  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line === "") continue;
    const n = i + 1; // human line number, counted in the original file

    const parts = line.split(",").map((p) => p.trim());
    if (parts.length !== 3) {
      errors.push(`Line ${n}: expected 3 fields, got ${parts.length}`);
      continue;
    }
    const [month, category, amount] = parts;
    if (!MONTH_RE.test(month))
      errors.push(`Line ${n}: invalid month "${month}" (YYYY-MM)`);
    const categoryId = validCategories.get(category.toLowerCase());
    if (!categoryId)
      errors.push(
        `Line ${n}: unknown category "${category}" (valid: ${[...validCategories.keys()].join(", ")})`
      );
    // Tested on the string, not the number: Number("") is 0, so an empty field
    // would otherwise import as $0.00. An empty field is an absence; a logged
    // 0 is a measurement, and only the second one is valid data.
    const num = Number(amount.replace(/,/g, ""));
    if (amount === "" || !Number.isFinite(num) || num < 0)
      errors.push(`Line ${n}: invalid amount "${amount}"`);

    if (errors.length === 0 && categoryId)
      rows.push({ categoryId, month, amountCents: Math.round(num * 100) });
  }

  // DECISION: atomic import — any invalid row rejects the whole file.
  if (errors.length) return { ok: false, errors };
  return { ok: true, rows };
}
