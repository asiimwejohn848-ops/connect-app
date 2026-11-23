"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";

export default function LoginPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setStatus("");
    try {
      const supabase = createClient();
      const result = mode === "signup"
        ? await supabase.auth.signUp({
            email,
            password,
            options: { emailRedirectTo: window.location.origin + "/auth/callback" }
          })
        : await supabase.auth.signInWithPassword({ email, password });

      if (result.error) throw result.error;
      if (mode === "signup" && !result.data.session) {
        setStatus("Account created. Check your email to confirm your address, then sign in.");
      } else {
        window.location.assign("/");
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not complete the request.");
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword() {
    if (!email.trim()) { setStatus("Enter your email address first."); return; }
    setBusy(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + "/login"
      });
      if (error) throw error;
      setStatus("If this email is registered, a password reset link will be sent.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not send the reset request.");
    } finally { setBusy(false); }
  }

  return (
    <main className="shell" style={{ maxWidth: 500 }}>
      <div className="panel">
        <div className="brand">CON<span>NE</span>CT</div>
        <p className="muted" style={{ marginTop: 2 }}>A product of Cizzy Technologies</p>
        <div className="notice" style={{ margin: "20px 0" }}>Use an email address you control. Email confirmation should remain enabled for account security.</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className={mode === "signin" ? "button" : "button secondary"} onClick={() => { setMode("signin"); setStatus(""); }}>Sign in</button>
          <button className={mode === "signup" ? "button" : "button secondary"} onClick={() => { setMode("signup"); setStatus(""); }}>Create account</button>
        </div>
        <form onSubmit={submit}>
          <div className="field"><label htmlFor="email">Email address</label><input id="email" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" /></div>
          <div className="field"><label htmlFor="password">Password (at least 8 characters)</label><input id="password" type="password" minLength={8} autoComplete={mode === "signin" ? "current-password" : "new-password"} required value={password} onChange={e => setPassword(e.target.value)} /></div>
          <button className="button" type="submit" disabled={busy} style={{ width: "100%", marginTop: 10 }}>{busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}</button>
        </form>
        <button className="button secondary" type="button" disabled={busy} onClick={resetPassword} style={{ width: "100%", marginTop: 10 }}>Forgot password?</button>
        <p aria-live="polite" className="muted" style={{ minHeight: 42, overflowWrap: "anywhere" }}>{status}</p>
        <Link href="/" className="muted">← Back to CONNECT</Link>
      </div>
    </main>
  );
}
