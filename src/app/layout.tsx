import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pam.ai | Recepționera AI pentru afacerea ta",
  description: "Pam.ai, recepționera AI pentru afacerea ta: apeluri, informații și programări într-un singur loc.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ro">
      <body>
        <header className="site-header">
          <Link className="brand" href="/dashboard">Pam<span>.ai</span></Link>
          <span className="badge">În configurare</span>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
