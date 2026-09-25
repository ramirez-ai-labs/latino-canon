"use client";

import { startTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Any page whose api call fails for a reason the page doesn't handle itself (api down,
 * D1 error). Next strips the thrown message in production, so this can't say which -
 * `digest` is the id to find the real error in the web Worker's logs. reset() alone only
 * re-renders on the client; refresh() re-runs the server component that threw.
 */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  const retry = () =>
    startTransition(() => {
      router.refresh();
      reset();
    });

  return (
    <div className="mx-auto mt-12 flex max-w-md flex-col items-center rounded-2xl border border-border bg-surface-raised px-6 py-12 text-center">
      <p className="text-lg font-semibold text-text">Something went wrong loading this page</p>
      <p className="mt-2 text-sm text-muted">The catalog service didn&apos;t respond. Try again in a moment.</p>
      <div className="mt-6 flex gap-2">
        <button type="button" onClick={retry} className={buttonVariants({ variant: "primary", size: "sm" })}>
          Try again
        </button>
        <Link href="/" className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}>
          Home
        </Link>
      </div>
      {error.digest && <p className="mt-6 text-xs text-muted/70">Reference: {error.digest}</p>}
    </div>
  );
}
