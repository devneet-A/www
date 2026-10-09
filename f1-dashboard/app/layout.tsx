import type { Metadata, Viewport } from "next";
import { Geist_Mono, Titillium_Web } from "next/font/google";
import { ConnectionBanner } from "@/components/connection-banner";
import { SiteHeader } from "@/components/site-header";
import { Providers } from "./providers";
import "./globals.css";

/**
 * Fonts. The official F1 typeface ("Formula1 Display") is proprietary and
 * licensed by Formula One, so it can't be bundled here. Titillium Web is a
 * free (OFL) font with the same sporty, technical feel; next/font downloads
 * it at build time and serves it from our own domain (no layout shift).
 * If you hold a licence for the official font, see the README ("Fonts").
 *
 * Numbers in tables and timing use Geist Mono, whose equal-width digits keep
 * columns from jiggling as times update.
 */
const titillium = Titillium_Web({
  variable: "--font-titillium",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "600", "700", "900"],
});
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "F1 Live Dashboard",
  description: "Live timing, race control, strategy and standings for Formula 1 fans.",
};

export const viewport: Viewport = {
  themeColor: "#15151e",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${titillium.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        {/* Keyboard users can jump past the navigation straight to the page. */}
        <a
          href="#main"
          className="sr-only z-50 rounded-full bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
        >
          Skip to content
        </a>
        <Providers>
          <SiteHeader />
          <ConnectionBanner />
          {children}
        </Providers>
      </body>
    </html>
  );
}
