"use client";
import { useCallback, useEffect, useState } from "react";
import { toCents } from "@/lib/money";

interface Cat {
  _id: string;
  name: string;
}

export default function Manage() {
  const [cats, setCats] = useState<Cat[]>([]);
  const [locks, setLocks] = useState<string[]>([]);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const [newCat, setNewCat] = useState("");
  const [planCat, setPlanCat] = useState("");
  const [planMonth, setPlanMonth] = useState("2026-01");
  const [planAmount, setPlanAmount] = useState("");
  const [actCat, setActCat] = useState("");
  const [actMonth, setActMonth] = useState("2026-01");
  const [actAmount, setActAmount] = useState("");
  const [actNote, setActNote] = useState("");
  const [csv, setCsv] = useState("month,category,amount\n2026-01,Marketing,4800\n2026-01,Payroll,20500\n2026-02,Payroll,19800");
  const [lockMonth, setLockMonth] = useState("2026-01");

  const flash = (kind: "ok" | "error", text: string) => setMsg({ kind, text });

  const load = useCallback(async () => {
    const [c, l] = await Promise.all([fetch("/api/categories"), fetch("/api/locks")]);
    if (c.status === 401) {
      flash("error", "Please log in first.");
      return;
    }
    setCats((await c.json()).categories ?? []);
    setLocks(((await l.json()).locks ?? []).map((x: any) => x.month));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function post(url: string, body: unknown, method = "POST") {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      flash("ok", "Saved.");
      load();
    } else {
      flash(
        "error",
        [data.message, ...(data.details ?? [])].filter(Boolean).join("\n")
      );
    }
    return res.ok;
  }

  return (
    <>
      <h1>Manage data</h1>
      {msg && <div className={msg.kind}>{msg.text}</div>}

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Categories</h2>
        <div className="row">
          {cats.map((c) => (
            <span key={c._id} className="pill" style={{ background: "#e0e7ff", color: "#3730a3" }}>
              {c.name}
            </span>
          ))}
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <input placeholder="New category name" value={newCat} onChange={(e) => setNewCat(e.target.value)} />
          <button
            onClick={async () => {
              if (await post("/api/categories", { name: newCat })) setNewCat("");
            }}
          >
            Add category
          </button>
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Set a monthly target (plan)</h2>
        <div className="row">
          <select value={planCat} onChange={(e) => setPlanCat(e.target.value)}>
            <option value="">Category…</option>
            {cats.map((c) => (
              <option key={c._id} value={c._id}>{c.name}</option>
            ))}
          </select>
          <input type="month" value={planMonth} onChange={(e) => setPlanMonth(e.target.value)} />
          <input placeholder="Amount e.g. 5000" value={planAmount} onChange={(e) => setPlanAmount(e.target.value)} />
          <button
            onClick={() => {
              try {
                post("/api/plans", { categoryId: planCat, month: planMonth, amountCents: toCents(planAmount) }, "PUT");
              } catch (e: any) {
                flash("error", e.message);
              }
            }}
          >
            Save target
          </button>
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Log actual spend</h2>
        <div className="row">
          <select value={actCat} onChange={(e) => setActCat(e.target.value)}>
            <option value="">Category…</option>
            {cats.map((c) => (
              <option key={c._id} value={c._id}>{c.name}</option>
            ))}
          </select>
          <input type="month" value={actMonth} onChange={(e) => setActMonth(e.target.value)} />
          <input placeholder="Amount e.g. 4800" value={actAmount} onChange={(e) => setActAmount(e.target.value)} />
          <input placeholder="Note (optional)" value={actNote} onChange={(e) => setActNote(e.target.value)} />
          <button
            onClick={() => {
              try {
                post("/api/actuals", {
                  categoryId: actCat,
                  month: actMonth,
                  amountCents: toCents(actAmount),
                  note: actNote || undefined,
                });
              } catch (e: any) {
                flash("error", e.message);
              }
            }}
          >
            Log actual
          </button>
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>CSV import (actuals)</h2>
        <p style={{ color: "var(--muted)", fontSize: 13 }}>
          Format: <code>month,category,amount</code>. Import is atomic — any bad
          row rejects the whole file with line numbers.
        </p>
        <textarea rows={5} style={{ width: "100%" }} value={csv} onChange={(e) => setCsv(e.target.value)} />
        <button
          style={{ marginTop: 8 }}
          onClick={async () => {
            const res = await fetch("/api/actuals/import", { method: "POST", body: csv });
            const data = await res.json().catch(() => ({}));
            if (res.ok) flash("ok", `Imported ${data.imported} rows.`);
            else
              flash(
                "error",
                [data.message, ...(data.details ?? [])].filter(Boolean).join("\n")
              );
          }}
        >
          Import CSV
        </button>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Locked months</h2>
        <div className="row">
          {locks.length === 0 && <span style={{ color: "var(--muted)" }}>None locked.</span>}
          {locks.map((m) => (
            <span key={m} className="pill">
              {m}{" "}
              <a
                href="#"
                onClick={async (e) => {
                  e.preventDefault();
                  await fetch(`/api/locks?month=${m}`, { method: "DELETE" });
                  load();
                }}
              >
                unlock
              </a>
            </span>
          ))}
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <input type="month" value={lockMonth} onChange={(e) => setLockMonth(e.target.value)} />
          <button className="secondary" onClick={() => post("/api/locks", { month: lockMonth })}>
            Lock month
          </button>
        </div>
        <p style={{ color: "var(--muted)", fontSize: 13 }}>
          Locking a month makes its plans and actuals read-only — the API
          rejects edits with a 423 and a clear message, not just hidden buttons.
        </p>
      </div>
    </>
  );
}
