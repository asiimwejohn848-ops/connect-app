import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { signOut } from "@/app/actions";

export default async function HomePage() {
  let email: string | null = null;
  let configured = true;

  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    email = data.user?.email ?? null;
  } catch {
    configured = false;
  }

  return (
    <main className="shell">
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div className="brand">CON<span>NE</span>CT</div>
          <div className="muted">A product of Cizzy Technologies</div>
        </div>
        {email ? (
          <nav style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <Link className="button secondary" href="/profile">Profile</Link>
            <Link className="button" href="/contacts">Contacts</Link>
            <Link className="button" href="/messages">Messages</Link>
            <form action={signOut}><button className="button secondary" type="submit">Sign out</button></form>
          </nav>
        ) : (
          <Link className="button" href="/login">Sign in / Create account</Link>
        )}
      </header>

      <section style={{ padding: "76px 0 48px", maxWidth: 760 }}>
        <p style={{ color: "#c8aaff", fontWeight: 800, letterSpacing: ".12em", fontSize: ".75rem" }}>COMMUNICATION WITHOUT BOUNDARIES</p>
        <h1 style={{ fontSize: "clamp(2.5rem, 7vw, 5rem)", lineHeight: 1.02, margin: "12px 0 20px" }}>One world.<br />Endless connections.</h1>
        <p className="muted" style={{ fontSize: "1.12rem", maxWidth: 650 }}>A new way to bring people together through conversations, communities and shared ideas. Starting in Uganda, with a global vision.</p>
        {email && <p className="notice" style={{ marginTop: 24 }}>Signed in as <b>{email}</b>. Your account authentication is connected.</p>}
        {!configured && <p className="notice" style={{ marginTop: 24 }}>Setup required: add your Supabase project URL and publishable key to a local .env.local file.</p>}
      </section>

      <section className="panel">
        <h2 style={{ marginTop: 0 }}>The foundation is being built</h2>
        <p className="muted">The first development milestone is secure account access. Real-time conversations, groups, calls, translation and file sharing will be built and tested in later milestones.</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 20 }}>
          <span className="notice">Secure accounts</span><span className="notice">Messaging foundation</span><span className="notice">Uganda-first launch</span>
        </div>
      </section>
      <footer className="muted" style={{ marginTop: 28, fontSize: ".8rem" }}>CONNECT is under development. Features are not advertised as live until they are implemented and tested.</footer>
    </main>
  );
}
