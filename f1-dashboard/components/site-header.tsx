"use client";

/**
 * Floating pill navigation. It hovers over the page (sticky, with a gap
 * from the top edge), with a blurred glass background so content scrolling
 * underneath stays faintly visible. The current page is a filled red pill.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "Live" },
  { href: "/analysis", label: "Analysis" },
  { href: "/standings", label: "Standings" },
  { href: "/calendar", label: "Calendar" },
];

/** The app mark: the same speed-stripe shape as app/icon.svg. */
function Mark() {
  return (
    <svg viewBox="0 0 64 64" className="size-5" aria-hidden>
      <path d="M12 42 L34 20 H50 L28 42 Z" fill="#e10600" />
      <path d="M30 46 L44 32 H54 L40 46 Z" fill="currentColor" />
    </svg>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  return (
    // The wrapper is transparent: only the pill itself is visible.
    <header className="pointer-events-none sticky top-0 z-40 px-3 pt-3 sm:pt-4">
      <nav
        aria-label="Main"
        className="pointer-events-auto mx-auto flex w-fit max-w-full items-center gap-0.5 overflow-x-auto rounded-full border border-white/10 bg-[oklch(0.19_0.006_270/0.72)] p-1.5 shadow-lg shadow-black/40 backdrop-blur-xl sm:gap-1"
      >
        <Link href="/" className="flex shrink-0 items-center gap-1.5 rounded-full py-1 pr-1.5 pl-2 sm:pr-3" aria-label="F1 Dashboard home">
          <Mark />
          {/* Phones show just the mark, so all four links fit in the pill. */}
          <span className="hidden text-base font-black tracking-tight italic sm:inline">
            <span className="text-primary">F1</span> Dashboard
          </span>
        </Link>
        <span aria-hidden className="mr-0.5 h-5 w-px shrink-0 bg-white/10 sm:mr-1" />
        {LINKS.map((l) => {
          const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "shrink-0 rounded-full px-2.5 py-1.5 text-[13px] font-semibold transition-colors min-[400px]:px-3 sm:px-4 sm:text-sm",
                active
                  ? "bg-primary text-primary-foreground shadow-md shadow-primary/30"
                  : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
              )}
            >
              {l.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
