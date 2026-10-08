import { teamColour } from "@/lib/f1";

/** The thin vertical team-colour stripe next to a driver code. */
export function TeamBar({ colour }: { colour: string | null }) {
  return <span aria-hidden className="h-4 w-1 shrink-0 rounded-full" style={{ backgroundColor: teamColour(colour) }} />;
}
