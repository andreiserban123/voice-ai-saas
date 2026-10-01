import type { Metadata } from "next";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pam.ai | Recepționera AI pentru afacerea ta",
  description: "Pam.ai, recepționera AI pentru afacerea ta: apeluri, informații și programări într-un singur loc.",
};

// Runs before the page paints so persisted preferences never flash the wrong theme.
const themeScript = `(function(){var preference=null;try{preference=localStorage.getItem('pam-theme')}catch{}var explicit=preference==='light'||preference==='dark';var theme=explicit?preference:window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.dataset.theme=theme;document.documentElement.dataset.themePreference=explicit?preference:'system'})();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ro" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-3 focus:text-primary-content">Mergi la conținut</a>
        <header className="sticky top-0 z-30 border-b border-base-300 bg-base-100/90 backdrop-blur-lg">
          <div className="mx-auto flex min-h-20 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-10">
            <div className="flex min-w-0 items-center gap-5">
              <Link className="flex shrink-0 items-center gap-2.5 text-2xl font-bold tracking-tight" href="/dashboard" aria-label="Pam.ai">
                <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-content shadow-sm">
                  <svg aria-hidden="true" width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                    <path d="M4 10v4m4-7v10m4-13v16m4-13v10m4-7v4" />
                  </svg>
                </span>
                <span>Pam<span className="text-primary">.ai</span></span>
              </Link>
              <span className="hidden border-l border-base-300 pl-5 text-sm text-base-content/60 lg:block">Recepția ta, mereu aici</span>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <span className="badge badge-outline hidden gap-2 border-base-300 bg-base-200 px-3 py-3.5 text-xs font-medium text-base-content/70 sm:inline-flex">
                <span aria-hidden="true" className="size-1.5 rounded-full bg-warning" />
                În configurare
              </span>
              <ThemeToggle />
            </div>
          </div>
        </header>
        <main id="main-content" className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-12 lg:px-10">{children}</main>
      </body>
    </html>
  );
}
