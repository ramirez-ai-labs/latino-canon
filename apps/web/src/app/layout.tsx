import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import Link from "next/link";
import { THEME_INIT_SCRIPT, ThemeToggle } from "@/components/theme/ThemeToggle";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

// Cartelera's display serif, for headlines and the "why it matters" note.
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  axes: ["opsz"],
});

export const metadata: Metadata = {
  title: { default: "Latino Canon", template: "%s · Latino Canon" },
  description: "A search experience for Latino-led films and series.",
};

const NAV_LINKS = [
  { href: "/search", label: "Explore" },
  { href: "/catalog", label: "Catalog" },
  { href: "/#collections", label: "Collections" },
  { href: "/eval", label: "Eval" },
  { href: "/about", label: "About" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: THEME_INIT_SCRIPT may set data-theme before React hydrates.
    <html lang="en" className={`${inter.variable} ${fraunces.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-screen bg-bg text-text antialiased">
        <header className="sticky top-0 z-50 border-b-[1.5px] border-ink-rule bg-bg">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
            <Link href="/" className="font-display text-[1.35rem] font-extrabold tracking-tight">
              Latino <span className="text-accent">Canon</span>
            </Link>
            <div className="flex items-center gap-5">
              <nav className="hidden items-center gap-6 text-[0.8rem] font-medium uppercase tracking-[0.08em] text-muted sm:flex">
                {NAV_LINKS.map((l) => (
                  <Link key={l.href} href={l.href} className="transition-colors hover:text-text">
                    {l.label}
                  </Link>
                ))}
              </nav>
              <ThemeToggle />
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
      </body>
    </html>
  );
}
