import type { Metadata } from "next";
import "./globals.css";
import "./cizzy.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://cizzytechnologies.com"),
  title: {
    default: "Cizzy Technologies — Ideas Become Technology",
    template: "%s | Cizzy Technologies",
  },
  description: "Discover digital products, applications and innovations created by Cizzy Technologies. Rooted in Uganda, built with a global outlook.",
  applicationName: "Cizzy Technologies",
  keywords: ["Cizzy Technologies", "digital products", "applications", "Uganda technology", "CONNECT"],
  openGraph: {
    title: "Cizzy Technologies — Ideas Become Technology",
    description: "A home for digital ideas, products and experiences.",
    type: "website",
    siteName: "Cizzy Technologies",
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
