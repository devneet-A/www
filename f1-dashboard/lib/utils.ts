import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind class names. clsx handles conditionals
 * (`cn("a", isLive && "b")`) and tailwind-merge resolves conflicts
 * so `cn("p-2", "p-4")` becomes "p-4". Standard shadcn/ui helper.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
