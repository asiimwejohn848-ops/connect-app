import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import MessagesClient from "./messages-client";

export default async function MessagesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <main className="shell">
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <Link className="brand" href="/">CON<span style={{ color: "var(--accent)" }}>NE</span>CT</Link>
        <nav style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link className="button secondary" href="/contacts">Contacts</Link>
          <Link className="button secondary" href="/">Home</Link>
        </nav>
      </header>
      <section style={{ margin: "42px auto", maxWidth: 980 }}>
        <p style={{ color: "#c8aaff", fontWeight: 800, letterSpacing: ".12em", fontSize: ".75rem" }}>STAY CONNECTED</p>
        <h1 style={{ margin: "4px 0 8px" }}>Messages</h1>
        <p className="muted">Private text conversations with people who have accepted your contact request.</p>
        <MessagesClient userId={user.id} />
        <p className="muted" style={{ fontSize: ".8rem", marginTop: 18 }}>This is an early messaging version. Messages refresh when you open or manually refresh a conversation; live updates and delivery status are not implemented yet.</p>
      </section>
    </main>
  );
}
