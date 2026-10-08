import Link from "next/link";

/** Top bar. Navigation links are added as each page is built. */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-12 w-full max-w-6xl items-center px-4">
        <Link href="/" className="font-bold tracking-tight">
          <span className="text-primary">F1</span> Live
        </Link>
      </div>
    </header>
  );
}
