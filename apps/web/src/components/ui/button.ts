import { cva } from "class-variance-authority";

/**
 * Exported as a className builder (not a component) so it applies to both
 * <button> and next/link's <Link> - pagination and nav actions here are
 * navigational, not form submissions.
 */
export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:pointer-events-none disabled:opacity-40",
  {
    variants: {
      variant: {
        primary: "bg-accent text-bg font-semibold hover:bg-accent/90",
        secondary: "bg-surface-raised text-text hover:bg-surface-raised/70 border border-border",
        ghost: "text-muted hover:bg-surface-raised hover:text-text",
      },
      size: {
        sm: "h-8 px-3.5 text-[0.8rem]",
        md: "h-10 px-5",
        lg: "h-12 px-6 text-base",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);
