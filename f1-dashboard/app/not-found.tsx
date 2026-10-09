import Link from "next/link";
import { pillButton } from "@/components/ui/pill";

export default function NotFound() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-16 text-center">
      <p className="text-sm font-semibold text-primary">404</p>
      <h1 className="mt-1 text-3xl font-black italic">Off track</h1>
      <p className="mt-2 text-muted-foreground">This page doesn&apos;t exist.</p>
      <Link href="/" className={`mt-6 ${pillButton()}`}>
        Back to live timing
      </Link>
    </main>
  );
}
