/** Parse a user-entered amount ("4800", "4,800.50") into integer cents. */
export function toCents(input: string | number): number {
  const n =
    typeof input === "number" ? input : Number(String(input).replace(/,/g, ""));
  if (!Number.isFinite(n)) throw new Error(`Invalid amount: ${input}`);
  return Math.round(n * 100);
}

export function fmt(cents: number | null): string {
  if (cents === null) return "\u2014";
  const sign = cents < 0 ? "\u2212" : "";
  return sign + (Math.abs(cents) / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
