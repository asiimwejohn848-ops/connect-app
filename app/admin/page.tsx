import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import AdminConsole from "./admin-console";

export const metadata = { title: "Cizzy Studio | Cizzy Technologies", robots: { index: false, follow: false } };

export default async function AdminPage() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    return <main className="admin-shell"><section className="admin-panel"><div className="company-section-index">CIZZY STUDIO / SETUP REQUIRED</div><h1>Connect your workspace.</h1><p>Configure the Supabase project URL and publishable key in your deployment environment, then run the database setup script.</p><Link className="company-button" href="/">Back to company website ↗</Link></section></main>;
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=%2Fadmin");
  const { data: membership } = await supabase.from("cizzy_staff")
    .select("role").eq("user_id", user.id).maybeSingle();
  if (!membership) redirect("/admin/access-denied");
  const { data: products, error: productsError } = await supabase.from("cizzy_products")
    .select("*").order("updated_at", { ascending: false });
  const { data: staff } = membership.role === "owner"
    ? await supabase.from("cizzy_staff").select("user_id,role,created_at").order("created_at")
    : { data: [] };
  return <AdminConsole currentUserId={user.id} userEmail={user.email ?? ""} role={membership.role} initialProducts={products ?? []} initialStaff={staff ?? []} initialError={productsError?.message ?? ""} />;
}
