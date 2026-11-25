import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import GiftsClient from "./gifts-client";

export default async function GiftsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <main className="shell">
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <Link className="brand" href="/">CON<span style={{ color: "var(--accent)" }}>NE</span>CT</Link>
        <nav style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link className="button secondary" href="/messages">Messages</Link>
          <Link className="button secondary" href="/">Home</Link>
        </nav>
      </header>
      <section style={{ margin: "42px auto", maxWidth: 760 }}>
        <p style={{ color: "#c8aaff", fontWeight: 800, letterSpacing: ".12em", fontSize: ".75rem" }}>SPECIAL CONNECTIONS</p>
        <h1 style={{ margin: "4px 0 8px" }}>Gift Messages</h1>
        <p className="muted">A message is only revealed after its recipient requests access and its sender approves.</p>
        <GiftsClient userId={user.id} />
      </section>
    </main>
  );
}
