"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/** Pages in the top bar. */
const LINKS = [
  { href: "/", label: "Live" },
  { href: "/analysis", label: "Analysis" },
  { href: "/standings", label: "Standings" },
  { href: "/calendar", label: "Calendar" },
];

export function SiteHeader() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-12 w-full max-w-6xl items-center gap-3 px-4 sm:gap-5">
        <Link href="/" className="font-bold tracking-tight">
          <span className="text-primary">F1</span> Live
        </Link>
        {/* Scrolls sideways on very narrow phones rather than wrapping. */}
        <nav className="-mr-4 flex gap-0.5 overflow-x-auto pr-4 text-sm sm:gap-1">
          {LINKS.map((l) => {
            const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={cn("shrink-0 rounded-md px-2 py-1 sm:px-2.5", active ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
