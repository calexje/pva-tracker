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
  name: z.string().trim().min(1, "Category name is required").max(60),
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
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return { ok: false, errors: ["CSV is empty"] };

  const header = lines[0].toLowerCase().replace(/\s/g, "");
  if (header !== "month,category,amount")
    return {
      ok: false,
      errors: [`Header must be "month,category,amount" (got "${lines[0]}")`],
    };

  const errors: string[] = [];
  const rows: { categoryId: string; month: string; amountCents: number }[] = [];
  lines.slice(1).forEach((line, i) => {
    const n = i + 2; // human line number
    const parts = line.split(",").map((p) => p.trim());
    if (parts.length !== 3) {
      errors.push(`Line ${n}: expected 3 fields, got ${parts.length}`);
      return;
    }
    const [month, category, amount] = parts;
    if (!MONTH_RE.test(month))
      errors.push(`Line ${n}: invalid month "${month}" (YYYY-MM)`);
    const categoryId = validCategories.get(category.toLowerCase());
    if (!categoryId)
      errors.push(
        `Line ${n}: unknown category "${category}" (valid: ${[...validCategories.keys()].join(", ")})`
      );
    const num = Number(amount.replace(/,/g, ""));
    if (!Number.isFinite(num) || num < 0)
      errors.push(`Line ${n}: invalid amount "${amount}"`);
    if (errors.length === 0 && categoryId)
      rows.push({ categoryId, month, amountCents: Math.round(num * 100) });
  });

  // DECISION: atomic import — any invalid row rejects the whole file.
  if (errors.length) return { ok: false, errors };
  return { ok: true, rows };
}
