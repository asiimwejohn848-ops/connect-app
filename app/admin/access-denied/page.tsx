import Link from "next/link";
export const metadata = { title: "Access unavailable | Cizzy Studio", robots: { index: false, follow: false } };
export default function AccessDeniedPage() {
  return <main className="admin-shell"><section className="admin-panel"><div className="company-section-index">CIZZY STUDIO / RESTRICTED AREA</div><h1>This workspace is private.</h1><p>Your account is signed in, but it has not been granted Cizzy Studio access. Ask a workspace owner to add your Supabase Auth user ID to the authorised team.</p><div className="admin-panel-actions"><Link className="company-button" href="/">Return to Cizzy Technologies ↗</Link><Link className="detail-back" href="/login">Use another account</Link></div></section></main>;
}
