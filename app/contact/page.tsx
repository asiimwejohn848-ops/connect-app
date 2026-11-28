import Link from "next/link";
export const metadata = { title: "Contact | Cizzy Technologies", description: "Get in touch with Cizzy Technologies." };
export default function ContactPage() {
  return <main className="admin-shell"><section className="admin-panel"><div className="company-section-index">CIZZY TECHNOLOGIES / CONTACT</div><h1>Let’s build something meaningful.</h1><p>We welcome conversations about digital products, collaborations and partnerships. Our public enquiry channels are being prepared; please check back soon for verified contact details.</p><div className="admin-panel-actions"><Link className="company-button" href="/#products">Explore our products ↗</Link><Link className="detail-back" href="/">Back to home</Link></div></section></main>;
}
