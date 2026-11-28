import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/utils/supabase/server";

type Product = {
  slug: string; name: string; tagline: string; description: string; category: string;
  status: string; featured: boolean; logo_url: string; website_url: string;
  android_url: string; ios_url: string; screenshots: string[];
};

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("cizzy_products")
    .select("name,tagline,description").eq("slug", slug).maybeSingle();
  return data ? {
    title: `${data.name} | Cizzy Technologies`,
    description: data.tagline || data.description
  } : { title: "Product | Cizzy Technologies" };
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("cizzy_products")
    .select("slug,name,tagline,description,category,status,featured,logo_url,website_url,android_url,ios_url,screenshots")
    .eq("slug", slug).neq("status", "draft").maybeSingle();
  let product = data as Product | null;
  if (!product && slug === "connect") {
    product = {
      slug: "connect", name: "CONNECT", tagline: "A more meaningful way to connect.",
      description: "CONNECT is a communication product being developed by Cizzy Technologies. Its vision is to make everyday conversations more expressive and accessible, with thoughtful ideas for voice, VIP messages and creative tools.",
      category: "Communication", status: "in_development", featured: true, logo_url: "",
      website_url: "", android_url: "", ios_url: "", screenshots: []
    };
  }
  if (!product) notFound();
  const status = product.status === "available" ? "Available" : product.status === "coming_soon" ? "Coming soon" : "In development";

  return <main className="product-detail-page">
    <header className="product-detail-header"><Link className="company-brand" href="/"><span className="company-monogram">C</span><span>CIZZY<span className="brand-accent">.</span><small>TECHNOLOGIES</small></span></Link><Link className="detail-back" href="/#products">← All products</Link></header>
    <section className="product-detail-hero">
      <div className="company-section-index">CIZZY TECHNOLOGIES <span>/</span> {product.category.toUpperCase()}</div>
      <div className="detail-emblem">{product.logo_url ? <img src={product.logo_url} alt={product.name + " logo"} /> : product.name.slice(0,1)}</div>
      <span className="product-status detail-status">{status}</span>
      <h1>{product.name}<span>.</span></h1><h2>{product.tagline}</h2>
      <p>{product.description}</p>
      <div className="detail-actions">
        {product.website_url && <a className="company-button" href={product.website_url} target="_blank" rel="noreferrer">Visit product <span>↗</span></a>}
        {product.android_url && <a className="detail-platform-link" href={product.android_url} target="_blank" rel="noreferrer">Android download ↗</a>}
        {product.ios_url && <a className="detail-platform-link" href={product.ios_url} target="_blank" rel="noreferrer">iOS download ↗</a>}
      </div>
      {product.status !== "available" && <div className="detail-development-note">This product is currently {status.toLowerCase()}. Follow Cizzy Technologies for release announcements.</div>}
    </section>
    {product.screenshots?.length > 0 && <section className="detail-gallery"><div className="company-section-index">A CLOSER LOOK</div><div className="detail-gallery-grid">{product.screenshots.map((src,i)=><img src={src} alt={`${product!.name} preview ${i+1}`} key={src}/>)}</div></section>}
    <footer className="detail-footer"><span>© {new Date().getFullYear()} Cizzy Technologies</span><Link href="/">Discover more products ↗</Link></footer>
  </main>;
}
