import Link from "next/link";
import { createClient } from "@/utils/supabase/server";

type Product = {
  id: string; slug: string; name: string; tagline: string; description: string;
  category: string; status: "draft" | "in_development" | "coming_soon" | "available";
  featured: boolean; logo_url: string; website_url: string; android_url: string;
  ios_url: string; screenshots: string[]; sort_order: number;
};

const fallbackProducts: Product[] = [{
  id: "connect-preview", slug: "connect", name: "CONNECT",
  tagline: "A more meaningful way to connect.",
  description: "A communication experience imagined in Uganda, with a vision to bring people closer everywhere.",
  category: "Communication", status: "in_development", featured: true,
  logo_url: "", website_url: "", android_url: "", ios_url: "", screenshots: [], sort_order: 1
}];

const statusLabel: Record<Product["status"], string> = {
  draft: "Private draft", in_development: "In development",
  coming_soon: "Coming soon", available: "Available"
};

export default async function HomePage() {
  let products: Product[] = fallbackProducts;
  try {
    const supabase = await createClient();
    const { data } = await supabase.from("cizzy_products")
      .select("id,slug,name,tagline,description,category,status,featured,logo_url,website_url,android_url,ios_url,screenshots,sort_order")
      .neq("status", "draft")
      .order("featured", { ascending: false }).order("sort_order").order("created_at", { ascending: false });
    if (data?.length) products = data as Product[];
  } catch { /* Keep the public company page useful before Supabase is configured. */ }

  return (
    <main className="cizzy-site">
      <div className="company-topline"><span className="topline-mark" /> INDEPENDENT IDEAS. THOUGHTFUL TECHNOLOGY. <span className="topline-right">UGANDA <b>↗</b> THE WORLD</span></div>
      <header className="company-header">
        <Link className="company-brand" href="/" aria-label="Cizzy Technologies home">
          <span className="company-monogram">C</span><span>CIZZY<span className="brand-accent">.</span><small>TECHNOLOGIES</small></span>
        </Link>
        <nav className="company-nav" aria-label="Main navigation">
          <a href="#products">Products</a><a href="#about">About</a><a href="#approach">Our approach</a>
          <Link className="company-nav-cta" href="/contact">Let’s talk <span>↗</span></Link>
        </nav>
      </header>

      <section className="company-hero">
        <div className="hero-ambient" />
        <div className="company-hero-copy">
          <div className="company-eyebrow"><span /> A TECHNOLOGY COMPANY WITH A BIGGER PICTURE</div>
          <h1>We turn bold<br />ideas into <em>digital</em><br /><em>possibilities.</em></h1>
          <p>We imagine, design and build digital products that make everyday experiences better. From our roots in Uganda, our ambition reaches everywhere.</p>
          <div className="company-hero-actions"><a className="company-button" href="#products">Explore our products <span>↗</span></a><a className="company-text-link" href="#about">Get to know us <span>↓</span></a></div>
          <div className="company-hero-note"><span>✳</span> CURIOSITY IN OUR THINKING. PURPOSE IN WHAT WE BUILD.</div>
        </div>
        <div className="company-hero-art" aria-label="Abstract Cizzy Technologies brand artwork">
          <div className="hero-orbit orbit-a" /><div className="hero-orbit orbit-b" /><div className="hero-orbit orbit-c" />
          <div className="hero-sculpture"><div className="sculpture-face face-one" /><div className="sculpture-face face-two" /><div className="sculpture-core">C<span>.</span></div></div>
          <div className="hero-art-label label-a"><span>01</span> IMAGINE</div><div className="hero-art-label label-b"><span>02</span> CREATE</div>
          <div className="hero-art-caption">A FUTURE, BUILT WITH INTENTION</div>
        </div>
      </section>

      <section className="company-manifesto" id="about">
        <div className="company-section-index">01 <span>/</span> WHO WE ARE</div>
        <div className="manifesto-content"><h2>Good technology<br />should move life <em>forward.</em></h2><div><p>Cizzy Technologies is a home for digital ideas, products and experiences. We believe useful technology starts with understanding people — then building with clarity, care and ambition.</p><p>Our work spans communication, digital tools and new ideas that have the potential to make a difference.</p><a className="company-underlined" href="#approach">What guides our work <span>↗</span></a></div></div>
      </section>

      <section className="company-products" id="products">
        <div className="company-section-index">02 <span>/</span> OUR DIGITAL PRODUCTS</div>
        <div className="products-heading"><div><h2>Made to be <em>useful.</em></h2><p>Explore the applications and digital experiences taking shape at Cizzy Technologies.</p></div><span className="product-count">{String(products.length).padStart(2,"0")} <small>PRODUCTS</small></span></div>
        <div className="company-product-grid">
          {products.map((product, index) => (
            <article className={product.featured ? "company-product-card is-featured" : "company-product-card"} key={product.id}>
              <div className="product-card-top"><span className="product-index">0{index + 1} / {product.category.toUpperCase()}</span><span className="product-status">{statusLabel[product.status]}</span></div>
              <div className="product-emblem">{product.logo_url ? <img src={product.logo_url} alt={product.name + " logo"} /> : <span>{product.name.slice(0,1).toUpperCase()}</span>}</div>
              <div className="product-card-bottom"><div className="product-company-label">A CIZZY PRODUCT</div><h3>{product.name}</h3><p className="product-tagline">{product.tagline}</p><p className="product-description">{product.description}</p><Link className="product-open-link" href={`/products/${product.slug}`}>Discover product <span>↗</span></Link></div>
              {product.featured && <span className="featured-ribbon">FEATURED</span>}
            </article>
          ))}
        </div>
        <div className="products-footnote"><span>✳</span> MORE IDEAS ARE IN THE WORKS. THIS COLLECTION WILL KEEP GROWING.</div>
      </section>

      <section className="company-approach" id="approach">
        <div className="company-section-index">03 <span>/</span> WHAT WE BELIEVE</div>
        <h2>Ambition, with<br /><em>intention.</em></h2>
        <div className="approach-grid">
          <article><span>01</span><h3>People first</h3><p>We start with real needs, everyday challenges and the people behind them.</p></article>
          <article><span>02</span><h3>Build with purpose</h3><p>Every product should have a clear reason to exist and a meaningful role to play.</p></article>
          <article><span>03</span><h3>Think beyond borders</h3><p>Rooted in Uganda, we build with an open mind and a global perspective.</p></article>
        </div>
      </section>

      <section className="company-contact">
        <div className="contact-orb">C<span>.</span></div><div className="company-section-index">04 / START A CONVERSATION</div>
        <h2>Have an idea<br />worth <em>building?</em></h2><p>We welcome conversations about products, partnerships and possibilities.</p>
        <Link className="company-button" href="/contact">Connect with Cizzy <span>↗</span></Link>
      </section>

      <footer className="company-footer">
        <div className="footer-upper"><Link className="company-brand" href="/"><span className="company-monogram">C</span><span>CIZZY<span className="brand-accent">.</span><small>TECHNOLOGIES</small></span></Link><p>Ideas become technology.<br />Technology moves the world.</p><a href="#top" onClick={(e)=>{e.preventDefault();window.scrollTo({top:0,behavior:"smooth"});}}>BACK TO TOP ↑</a></div>
        <div className="footer-lower"><span>© {new Date().getFullYear()} Cizzy Technologies. All rights reserved.</span><span>Built with curiosity in Uganda.</span><Link href="/admin">Team access ↗</Link></div>
      </footer>
    </main>
  );
}
