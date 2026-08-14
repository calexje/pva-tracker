"use client";
import { useCallback, useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { fmt } from "@/lib/money";
import { variancePct } from "@/lib/variance";

interface Row {
  month: string;
  categoryName: string;
  planCents: number | null;
  actualCents: number | null;
  varianceCents: number | null;
  variancePct: number | null;
}
interface Totals {
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

export default function Report() {
  const [from, setFrom] = useState("2026-01");
  const [to, setTo] = useState("2026-03");
  const [rows, setRows] = useState<Row[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [locked, setLocked] = useState<string[]>([]);
  const [err, setErr] = useState("");
  const [needsAuth, setNeedsAuth] = useState(false);

  const load = useCallback(async () => {
    setErr("");
    const res = await fetch(`/api/report?from=${from}&to=${to}`);
    if (res.status === 401) return setNeedsAuth(true);
    const data = await res.json();
    if (!res.ok) return setErr(data.message ?? "Failed to load report");
    setNeedsAuth(false);
    setRows(data.rows);
    setTotals(data.totals);
    setLocked(data.lockedMonths ?? []);
  }, [from, to]);

  useEffect(() => {
    load();
  }, [load]);

  if (needsAuth)
    return (
      <div className="card">
        <h1>Plan vs Actual report</h1>
        <p>
          Please <a href="/login">log in</a> or <a href="/signup">sign up</a> to
          view your report.
        </p>
      </div>
    );

  const pct = (v: number | null) =>
    v === null ? "\u2014" : `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;

  return (
    <>
      <h1>Plan vs Actual report</h1>
      <div className="card row">
        <label>
          From{" "}
          <input
            type="month"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          To{" "}
          <input type="month" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <button onClick={load}>Run report</button>
        {err && <span className="error">{err}</span>}
      </div>

      {totals && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Monthly net variance</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={totals.monthlyNetVariance}>
              <XAxis dataKey="month" />
              <YAxis tickFormatter={(v) => fmt(v as number)} width={90} />
              <Tooltip formatter={(v) => fmt(v as number)} />
              <ReferenceLine y={0} stroke="#9ca3af" />
              <Bar dataKey="varianceCents" stackId="net" name="Variance">
                {totals.monthlyNetVariance.map((d, i) => (
                  <Cell
                    key={i}
                    fill={d.varianceCents > 0 ? "#dc2626" : "#16a34a"}
                  />
                ))}
              </Bar>
              {/* Plotted negative so the stack height equals the month's net
                  position against plan. The module stores the magnitude; the
                  sign is a presentation choice. */}
              <Bar
                dataKey={(d: { unallocatedCents: number }) =>
                  -d.unallocatedCents
                }
                stackId="net"
                name="Unallocated"
                fill="#94a3b8"
              />
            </BarChart>
          </ResponsiveContainer>
          <div>
          <p style={{ color: "var(--muted)", fontSize: 13 }}>Positive (red) = over plan </p>
          <p style={{ color: "var(--muted)", fontSize: 13 }}>Negative (green) = under plan </p>
          <p style={{ color: "var(--muted)", fontSize: 13 }}>Unallocated (grey) =  unallocated budget, no actual logged</p>
          </div>
        </div>
      )}

      <table>
        <thead>
          <tr>
            <th>Month</th>
            <th>Category</th>
            <th>Plan</th>
            <th>Actual</th>
            <th>Variance</th>
            <th>Variance %</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={locked.includes(r.month) ? "locked" : ""}>
              <td>
                {r.month}
                {locked.includes(r.month) && <span className="pill">locked</span>}
              </td>
              <td>{r.categoryName}</td>
              <td>{fmt(r.planCents)}</td>
              <td>{fmt(r.actualCents)}</td>
              <td
                className={
                  r.varianceCents === null
                    ? ""
                    : r.varianceCents > 0
                      ? "pos"
                      : "neg"
                }
              >
                {fmt(r.varianceCents)}
              </td>
              <td>{pct(r.variancePct)}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} style={{ textAlign: "center", color: "var(--muted)" }}>
                No plans or actuals in this range yet — add some under Manage data.
              </td>
            </tr>
          )}
        </tbody>
        {totals && rows.length > 0 && (
          <tfoot>
            <tr>
              <th colSpan={2}>Totals</th>
              <th>{fmt(totals.planCents)}</th>
              <th>{fmt(totals.actualCents)}</th>
              <th className={totals.varianceCents > 0 ? "pos" : "neg"}>
                {fmt(totals.varianceCents)}
              </th>
              {/* Single shared calculation module: no variance math in the UI. */}
              <th>{pct(variancePct(totals.planCents, totals.actualCents))}</th>
            </tr>
          </tfoot>
        )}
      </table>
      <p style={{ color: "var(--muted)", fontSize: 13 }}>
        {"\u2014"} = no actual logged for that category-month (not treated as
        zero per row; totals sum recorded values only).
        </p>
        {totals && totals.unallocatedCents > 0 && (
          <>
          <p style={{ color: "var(--muted)", fontSize: 13 }}>
            {" "}
            Of the range total, {fmt(totals.unallocatedCents)} is unallocated
            plan {"\u2014"} budgeted, with no actuals logged against it.
          </p>
          </>
        )}
    </>
  );
}
