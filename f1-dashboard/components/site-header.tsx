"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/** Pages in the top bar. Standings and Calendar are added in step 5. */
const LINKS = [
  { href: "/", label: "Live" },
  { href: "/analysis", label: "Analysis" },
];

export function SiteHeader() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-12 w-full max-w-6xl items-center gap-5 px-4">
        <Link href="/" className="font-bold tracking-tight">
          <span className="text-primary">F1</span> Live
        </Link>
        <nav className="flex gap-1 text-sm">
          {LINKS.map((l) => {
            const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={cn("rounded-md px-2.5 py-1", active ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground")}
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
