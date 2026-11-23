import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CONNECT | Communication Without Boundaries",
  description: "CONNECT by Cizzy Technologies — bringing people together."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
