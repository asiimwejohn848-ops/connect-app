import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CONNECT — A More Meaningful Way to Connect",
  description:
    "Discover CONNECT by Cizzy Technologies: a new communication experience imagined in Uganda, with a vision to connect the world.",
  applicationName: "CONNECT",
  keywords: ["CONNECT", "Cizzy Technologies", "communication", "Uganda", "messaging"],
  openGraph: {
    title: "CONNECT — A More Meaningful Way to Connect",
    description: "A new communication experience. Uganda first, worldwide next.",
    type: "website",
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
