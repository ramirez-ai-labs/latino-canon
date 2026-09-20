import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
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
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen bg-bg text-text antialiased">
        <header className="sticky top-0 z-50 border-b border-border/80 bg-bg/80 backdrop-blur-md">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
            <Link href="/" className="text-[1.05rem] font-bold tracking-tight">
              Latino<span className="text-accent">Canon</span>
            </Link>
            <nav className="hidden items-center gap-6 text-sm text-muted sm:flex">
              {NAV_LINKS.map((l) => (
                <Link key={l.href} href={l.href} className="transition-colors hover:text-text">
                  {l.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
      </body>
    </html>
  );
}
