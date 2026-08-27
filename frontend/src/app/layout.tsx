import type { Metadata } from "next";
import { Inter, Space_Grotesk, Outfit } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

// Only used within the .ms-luxury scope (Home/Insights/Profile) — see
// globals.css's luxury-tokens block for where --font-luxury-display is
// consumed. Self-hosted via next/font like Inter, not the Superdesign
// draft's Google Fonts <link> tag, to avoid an extra render-blocking
// request on every page load for a font only 3 routes use.
const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

// Body face for the premium player (.ms-player). The design system also
// calls for Satoshi as the headline face — Satoshi is a Fontshare
// release, not a Google Font, so `next/font/google` cannot load it and
// the spec's own `<link href="...family=Satoshi...">` silently fails
// too. Space Grotesk (already self-hosted above) carries the headlines
// until a licensed Satoshi file is added to the repo; see
// docs/PREMIUM_PLAYER.md.
const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["300", "400", "500"],
});

export const metadata: Metadata = {
  title: "MoodSync — The intelligence layer for your smart home",
  description:
    "MoodSync connects your wearable to your smart home — and automatically adapts your environment to how you're actually doing.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${spaceGrotesk.variable} ${outfit.variable} h-full antialiased`}
      data-scroll-behavior="smooth"
    >
      <body className="min-h-full flex flex-col bg-canvas text-ink">{children}</body>
    </html>
  );
}
