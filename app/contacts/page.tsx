import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import ContactsClient from "./contacts-client";

export default async function ContactsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <main className="shell">
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
        <Link className="brand" href="/">CON<span style={{ color: "var(--accent)" }}>NE</span>CT</Link>
        <Link className="button secondary" href="/">Home</Link>
      </header>
      <section style={{ maxWidth: 760, margin: "42px auto" }}>
        <p style={{ color: "#c8aaff", fontWeight: 800, letterSpacing: ".12em", fontSize: ".75rem" }}>YOUR NETWORK</p>
        <h1 style={{ margin: "4px 0 8px" }}>Contacts</h1>
        <p className="muted">Find people on CONNECT and build your circle.</p>
        <ContactsClient userId={user.id} />
      </section>
    </main>
  );
}
