import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Recepție AI | Service auto",
  description: "Recepționer vocal pentru service-uri auto din România.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ro">
      <body>
        <header className="site-header">
          <Link className="brand" href="/dashboard">Recepție <span>AI</span></Link>
          <span className="badge">În configurare</span>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
