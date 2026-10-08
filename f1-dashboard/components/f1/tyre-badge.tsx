import { compoundInfo } from "@/lib/f1";
import { cn } from "@/lib/utils";

/**
 * A tyre as shown on TV graphics: a ring in the compound's colour with its
 * letter inside. Size is fixed so table columns never shift.
 */
export function TyreBadge({ compound, className }: { compound: string | null; className?: string }) {
  const info = compoundInfo(compound);
  return (
    <span
      title={info.label}
      aria-label={`${info.label} tyre`}
      className={cn(
        "inline-flex size-5 shrink-0 items-center justify-center rounded-full border-2 text-[10px] leading-none font-bold",
        className,
      )}
      style={{ borderColor: info.colour, color: info.colour }}
    >
      {info.letter}
    </span>
  );
}
