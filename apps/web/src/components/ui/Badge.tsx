import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium leading-normal",
  {
    variants: {
      variant: {
        default: "bg-surface-raised text-muted",
        inclusion: "bg-accent-muted text-accent",
        theme: "bg-cyan-muted text-accent-cyan",
        contextual: "bg-gold/15 text-gold",
        solid: "bg-accent text-bg font-semibold",
        oscar: "bg-gold text-bg font-semibold",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
