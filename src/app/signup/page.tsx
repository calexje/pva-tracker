"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Signup() {
  const r = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  return (
    <div className="card" style={{ maxWidth: 380, margin: "48px auto" }}>
      <h1>Sign up</h1>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setErr("");
          const res = await fetch("/api/auth/signup", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
          });
          if (res.ok) return r.push("/");
          // An infrastructure failure answers with an empty body, so parsing
          // unguarded throws and the user is left with a dead form.
          const data = await res.json().catch(() => ({}));
          setErr(data.message ?? "Signup failed");
        }}
      >
        <div className="row" style={{ flexDirection: "column", alignItems: "stretch" }}>
          <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input type="password" placeholder="Password (min 8 chars)" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <button type="submit">Create account</button>
          {err && <div className="error">{err}</div>}
        </div>
      </form>
    </div>
  );
}
