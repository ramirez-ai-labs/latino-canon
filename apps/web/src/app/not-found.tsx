import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export const metadata = { title: "Not found" };

/** An unknown path, or a title id the api 404s - including one not in the canon yet. */
export default function NotFound() {
  return (
    <div className="mx-auto mt-12 flex max-w-md flex-col items-center rounded-2xl border border-border bg-surface-raised px-6 py-12 text-center">
      <p className="text-lg font-semibold text-text">We couldn&apos;t find that page</p>
      <p className="mt-2 text-sm text-muted">
        If you followed a link to a title, it may not be in the canon yet. Search the catalog instead.
      </p>
      <Link href="/search" className={buttonVariants({ variant: "primary", size: "sm", className: "mt-6" })}>
        Search titles
      </Link>
    </div>
  );
}
