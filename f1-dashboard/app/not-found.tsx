import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-16 text-center">
      <p className="text-sm font-semibold text-primary">404</p>
      <h1 className="mt-1 text-2xl font-bold">Off track</h1>
      <p className="mt-2 text-muted-foreground">This page doesn&apos;t exist.</p>
      <Link href="/" className="mt-6 inline-block rounded-md border px-4 py-2 text-sm hover:bg-muted">
        Back to live timing
      </Link>
    </main>
  );
}
