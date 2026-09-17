import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Latino Canon", template: "%s · Latino Canon" },
  description: "A search experience for Latino-led films and series.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <Link href="/" className="brand">
            Latino<span>Canon</span>
          </Link>
          <nav>
            <Link href="/">Home</Link>
            <Link href="/search">Explore</Link>
            <Link href="/catalog">Catalog</Link>
            <Link href="/#collections">Collections</Link>
            <Link href="/eval">Eval</Link>
            <Link href="/about">About</Link>
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
