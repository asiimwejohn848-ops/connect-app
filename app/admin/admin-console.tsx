"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";

type Product = {
  id: string; slug: string; name: string; tagline: string; description: string;
  category: string; status: "draft" | "in_development" | "coming_soon" | "available";
  featured: boolean; logo_url: string; website_url: string; android_url: string;
  ios_url: string; screenshots: string[]; sort_order: number;
};
type Staff = { user_id: string; role: "owner" | "editor"; created_at: string };
type Draft = Omit<Product, "id">;
const emptyDraft: Draft = {
  slug: "", name: "", tagline: "", description: "", category: "Application",
  status: "in_development", featured: false, logo_url: "", website_url: "",
  android_url: "", ios_url: "", screenshots: [], sort_order: 100
};
const statusText: Record<Product["status"], string> = {
  draft: "Draft", in_development: "In development", coming_soon: "Coming soon", available: "Available"
};
const slugify = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export default function AdminConsole({ currentUserId, userEmail, role, initialProducts, initialStaff, initialError }: {
  currentUserId: string; userEmail: string; role: "owner" | "editor"; initialProducts: Product[]; initialStaff: Staff[]; initialError: string;
}) {
  const [products, setProducts] = useState(initialProducts);
  const [staff, setStaff] = useState(initialStaff);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"products" | "team">("products");
  const [teamId, setTeamId] = useState("");
  const [teamRole, setTeamRole] = useState<"editor" | "owner">("editor");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const supabase = useMemo(() => createClient(), []);

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft(current => ({ ...current, [key]: value }));
  }

  function startEdit(product: Product) {
    const { id, ...rest } = product;
    setDraft({ ...emptyDraft, ...rest });
    setEditingId(id);
    setMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function newProduct() {
    setDraft(emptyDraft);
    setEditingId(null);
    setMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function uploadFile(file: File, kind: "logo" | "screenshots") {
    if (!file.type.startsWith("image/")) throw new Error("Choose an image file.");
    if (file.size > 5 * 1024 * 1024) throw new Error("Images must be 5 MB or smaller.");
    const folder = slugify(draft.slug || draft.name || "new-product") || "new-product";
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
    const path = folder + "/" + kind + "-" + Date.now() + "-" + safeName;
    const { error } = await supabase.storage.from("cizzy-product-media").upload(path, file, { upsert: false, contentType: file.type });
    if (error) throw error;
    const { data } = supabase.storage.from("cizzy-product-media").getPublicUrl(path);
    return data.publicUrl;
  }

  async function handleLogo(file?: File) {
    if (!file) return;
    setBusy(true); setMessage("");
    try { update("logo_url", await uploadFile(file, "logo")); setMessage("Logo uploaded. Save the product to publish the change."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Upload failed."); }
    finally { setBusy(false); }
  }

  async function handleScreenshots(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true); setMessage("");
    try {
      const urls = await Promise.all(Array.from(files).map(file => uploadFile(file, "screenshots")));
      update("screenshots", [...draft.screenshots, ...urls]);
      setMessage(urls.length + " screenshot(s) uploaded. Save the product to keep the changes.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Upload failed."); }
    finally { setBusy(false); }
  }

  async function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.name.trim()) { setMessage("Product name is required."); return; }
    setBusy(true); setMessage("");
    const payload = {
      ...draft, slug: slugify(draft.slug || draft.name),
      name: draft.name.trim(), updated_at: new Date().toISOString()
    };
    try {
      const query = editingId
        ? await supabase.from("cizzy_products").update(payload).eq("id", editingId).select().single()
        : await supabase.from("cizzy_products").insert(payload).select().single();
      if (query.error) throw query.error;
      setProducts(current => editingId
        ? current.map(item => item.id === editingId ? query.data as Product : item)
        : [query.data as Product, ...current]);
      setDraft(emptyDraft); setEditingId(null); setMessage("Product saved successfully.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save product."); }
    finally { setBusy(false); }
  }

  async function deleteProduct(product: Product) {
    if (!window.confirm("Delete " + product.name + "? This cannot be undone.")) return;
    setBusy(true); setMessage("");
    const { error } = await supabase.from("cizzy_products").delete().eq("id", product.id);
    if (error) setMessage(error.message);
    else { setProducts(current => current.filter(item => item.id !== product.id)); if (editingId === product.id) newProduct(); setMessage("Product deleted."); }
    setBusy(false);
  }

  async function addTeamMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (role !== "owner") return;
    setBusy(true); setMessage("");
    const { data, error } = await supabase.from("cizzy_staff")
      .insert({ user_id: teamId.trim(), role: teamRole }).select().single();
    if (error) setMessage(error.message);
    else { setStaff(current => [...current, data as Staff]); setTeamId(""); setMessage("Team access granted. The member can now sign in."); }
    setBusy(false);
  }

  async function changeTeamRole(member: Staff, nextRole: "owner" | "editor") {
    setBusy(true); setMessage("");
    const { error } = await supabase.from("cizzy_staff").update({ role: nextRole }).eq("user_id", member.user_id);
    if (error) setMessage(error.message);
    else setStaff(current => current.map(item => item.user_id === member.user_id ? { ...item, role: nextRole } : item));
    setBusy(false);
  }

  async function removeTeamMember(member: Staff) {
    if (!window.confirm("Remove this person's Cizzy Studio access?")) return;
    setBusy(true); setMessage("");
    const { error } = await supabase.from("cizzy_staff").delete().eq("user_id", member.user_id);
    if (error) setMessage(error.message);
    else { setStaff(current => current.filter(item => item.user_id !== member.user_id)); setMessage("Team access removed."); }
    setBusy(false);
  }

  async function signOut() {
    await supabase.auth.signOut();
    window.location.assign("/");
  }

  return <main className="studio-shell">
    <aside className="studio-sidebar">
      <Link className="studio-brand" href="/"><span className="company-monogram">C</span><span>CIZZY<small>STUDIO</small></span></Link>
      <div className="studio-side-label">WORKSPACE</div>
      <button className={activeTab === "products" ? "studio-side-link active" : "studio-side-link"} onClick={() => setActiveTab("products")}>▦ <span>Products</span><b>{products.length}</b></button>
      {role === "owner" && <button className={activeTab === "team" ? "studio-side-link active" : "studio-side-link"} onClick={() => setActiveTab("team")}>♧ <span>Team access</span></button>}
      <div className="studio-sidebar-bottom"><span className="studio-avatar">{userEmail.slice(0,1).toUpperCase()}</span><div><b>{userEmail}</b><small>{role === "owner" ? "Workspace owner" : "Team editor"}</small></div><button onClick={signOut} aria-label="Sign out">↗</button></div>
    </aside>

    <section className="studio-main">
      <header className="studio-topbar"><div><span> CIZZY TECHNOLOGIES </span><b>/</b> {activeTab === "products" ? "PRODUCT MANAGEMENT" : "TEAM ACCESS"}</div><Link href="/" target="_blank">View website ↗</Link></header>
      <div className="studio-content">
        <div className="studio-welcome"><div><div className="company-section-index">YOUR PRIVATE WORKSPACE</div><h1>{activeTab === "products" ? "Product library." : "Your people."}</h1><p>{activeTab === "products" ? "Create, refine and publish the products that make up the Cizzy ecosystem." : "Manage who can help build and maintain the Cizzy product portfolio."}</p></div>
          {activeTab === "products" && <button className="company-button" onClick={newProduct}>＋ Add product</button>}
        </div>
        {initialError && <div className="studio-alert">Database response: {initialError}. Confirm that the Cizzy SQL setup has been run in Supabase.</div>}
        {message && <div className="studio-message" role="status">{message}</div>}

        {activeTab === "products" ? <>
          <form className="studio-form" onSubmit={saveProduct}>
            <div className="studio-form-heading"><div><span>{editingId ? "EDIT PRODUCT" : "NEW LISTING"}</span><h2>{editingId ? "Update a product" : "Add a product"}</h2></div>{editingId && <button type="button" className="studio-quiet-button" onClick={newProduct}>Cancel editing</button>}</div>
            <div className="studio-fields">
              <label>Product name<input required value={draft.name} onChange={e=>{update("name",e.target.value);if(!editingId&&!draft.slug)update("slug",slugify(e.target.value));}} placeholder="e.g. CONNECT"/></label>
              <label>URL slug<input value={draft.slug} onChange={e=>update("slug",slugify(e.target.value))} placeholder="connect"/></label>
              <label>Short tagline<input value={draft.tagline} onChange={e=>update("tagline",e.target.value)} placeholder="What does this product do?"/></label>
              <label>Category<input value={draft.category} onChange={e=>update("category",e.target.value)} placeholder="Communication, Productivity…"/></label>
              <label className="studio-wide">Description<textarea rows={4} value={draft.description} onChange={e=>update("description",e.target.value)} placeholder="Describe the product, who it helps and what makes it useful."/></label>
              <label>Product status<select value={draft.status} onChange={e=>update("status",e.target.value as Draft["status"])}><option value="draft">Draft (private)</option><option value="in_development">In development</option><option value="coming_soon">Coming soon</option><option value="available">Available</option></select></label>
              <label>Display order<input type="number" value={draft.sort_order} onChange={e=>update("sort_order",Number(e.target.value))}/></label>
              <label>Website URL<input type="url" value={draft.website_url} onChange={e=>update("website_url",e.target.value)} placeholder="https://…"/></label>
              <label>Android download URL<input type="url" value={draft.android_url} onChange={e=>update("android_url",e.target.value)} placeholder="https://…"/></label>
              <label>iOS download URL<input type="url" value={draft.ios_url} onChange={e=>update("ios_url",e.target.value)} placeholder="https://…"/></label>
              <label className="studio-check"><input type="checkbox" checked={draft.featured} onChange={e=>update("featured",e.target.checked)}/> Feature this product on the homepage</label>
              <div className="studio-upload studio-wide"><b>Product logo</b><p>PNG, JPG, WEBP or SVG. Maximum 5 MB.</p><input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={e=>handleLogo(e.target.files?.[0])}/>{draft.logo_url && <div className="studio-preview"><img src={draft.logo_url} alt="Product logo preview"/><button type="button" onClick={()=>update("logo_url","")}>Remove logo</button></div>}</div>
              <div className="studio-upload studio-wide"><b>Product screenshots</b><p>Upload multiple product images. Maximum 5 MB each.</p><input type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={e=>handleScreenshots(e.target.files)}/><div className="studio-screenshot-previews">{draft.screenshots.map((src,index)=><div key={src}><img src={src} alt={"Screenshot "+(index+1)}/><button type="button" onClick={()=>update("screenshots",draft.screenshots.filter(item=>item!==src))}>×</button></div>)}</div></div>
            </div>
            <div className="studio-form-footer"><span>Changes are stored in your Supabase product database.</span><button className="company-button" disabled={busy}>{busy ? "Saving…" : editingId ? "Save changes ↗" : "Save product ↗"}</button></div>
          </form>

          <div className="studio-list-heading"><div><span>YOUR CATALOGUE</span><h2>Published and planned products</h2></div><span>{products.length} TOTAL</span></div>
          <div className="studio-product-list">{products.map(product=><article className="studio-product-row" key={product.id}><div className="studio-product-icon">{product.logo_url?<img src={product.logo_url} alt=""/>:product.name.slice(0,1)}</div><div className="studio-product-name"><b>{product.name}</b><span>{product.tagline || product.slug}</span></div><span className={"studio-state state-"+product.status}>{statusText[product.status]}</span><div className="studio-row-actions"><Link href={"/products/"+product.slug} target="_blank">View ↗</Link><button onClick={()=>startEdit(product)}>Edit</button><button className="danger-text" disabled={busy} onClick={()=>deleteProduct(product)}>Delete</button></div></article>)}</div>
        </> : <section className="studio-team-panel">
          <div className="studio-list-heading"><div><span>ACCESS CONTROL</span><h2>Authorised team members</h2></div><span>{staff.length} MEMBERS</span></div>
          <p className="studio-team-help">Team members must first create and confirm their own account through the sign-in page. Add their Supabase Auth user UUID here to grant access. Editors can manage products; owners can also manage team access.</p>
          <form className="studio-team-form" onSubmit={addTeamMember}><label>Supabase Auth user UUID<input required value={teamId} onChange={e=>setTeamId(e.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"/></label><label>Role<select value={teamRole} onChange={e=>setTeamRole(e.target.value as "owner"|"editor")}><option value="editor">Editor — manage products</option><option value="owner">Owner — products and team</option></select></label><button className="company-button" disabled={busy}>Grant access ↗</button></form>
          <div className="studio-product-list">{staff.map(member=><article className="studio-product-row" key={member.user_id}><div className="studio-product-icon">♧</div><div className="studio-product-name"><b>{member.role === "owner" ? "Workspace owner" : "Team editor"}</b><span>{member.user_id}</span></div><select value={member.role} disabled={busy || member.user_id === currentUserId} onChange={e=>changeTeamRole(member,e.target.value as "owner"|"editor")}><option value="editor">Editor</option><option value="owner">Owner</option></select><button className="danger-text" disabled={busy || member.user_id === currentUserId} onClick={()=>removeTeamMember(member)}>Remove access</button></article>)}</div>
        </section>}
      </div>
    </section>
  </main>;
}
