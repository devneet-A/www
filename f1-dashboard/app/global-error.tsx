"use client";

/**
 * Last-resort error page, used only if the root layout itself fails.
 * It replaces the whole document, so global CSS isn't loaded: inline styles.
 */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="en">
      <body style={{ background: "#15151e", color: "#f5f5f5", fontFamily: "system-ui, sans-serif", padding: "2rem" }}>
        <title>Something went wrong · F1 Live Dashboard</title>
        <h1 style={{ fontSize: "1.25rem" }}>Something went wrong</h1>
        <p style={{ color: "#a3a3b0" }}>The dashboard couldn&apos;t load.{error.digest ? ` (ref ${error.digest})` : ""}</p>
        <button
          onClick={() => retry()}
          style={{ marginTop: "1rem", padding: "0.5rem 1rem", borderRadius: 6, border: "1px solid #444", background: "transparent", color: "inherit" }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
