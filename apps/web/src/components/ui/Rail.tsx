import { cn } from "@/lib/utils";

/**
 * Netflix-style horizontal row. Native scroll-snap instead of a carousel library -
 * works with touch/trackpad/keyboard for free, no JS needed for the scrolling itself.
 */
export function Rail({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("scrollbar-none -mx-6 flex snap-x snap-mandatory gap-4 overflow-x-auto px-6 pb-2", className)}>
      {children}
    </div>
  );
}

export function RailItem({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("shrink-0 snap-start", className)}>{children}</div>;
}
