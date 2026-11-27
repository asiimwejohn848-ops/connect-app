import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import ProfileForm from "./profile-form";

export default async function ProfilePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("username, display_name, bio, avatar_url, team_role, current_activity, availability_status")
    .eq("id", user.id)
    .single();

  if (error || !profile) {
    return (
      <main className="shell">
        <p className="notice">We couldn't load your profile. Please refresh the page. If this continues, share this message: {error?.message ?? "Profile record not found."}</p>
      </main>
    );
  }

  return (
    <main className="shell">
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
        <a className="brand" href="/">CON<span style={{ color: "var(--accent)" }}>NE</span>CT</a>
        <a className="button secondary" href="/">Home</a>
      </header>
      <section style={{ maxWidth: 680, margin: "48px auto" }} className="panel">
        <p style={{ color: "#c8aaff", fontWeight: 800, letterSpacing: ".12em", fontSize: ".75rem" }}>YOUR CONNECT ACCOUNT</p>
        <h1 style={{ marginTop: 4 }}>Your profile</h1>
        <p className="muted">Choose how other CONNECT members will see you. You can update these details later.</p>
        <ProfileForm initialProfile={profile} />
      </section>
    </main>
  );
}
