import { siteUrl } from "@/lib/site-url";
import type { Metadata } from "next";
import "@fontsource/manrope/latin-600.css";
import "@fontsource/manrope/latin-700.css";
import "@fontsource/manrope/latin-800.css";
import "@fontsource/dm-sans/latin-400.css";
import "@fontsource/dm-sans/latin-500.css";
import "@fontsource/dm-sans/latin-700.css";
import "./globals.css";
import { CookiePreferences } from "@/components/cookie-preferences";
import { BackToTop } from "@/components/site-tools";
export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: {
    default: "Verdant | Estate life, together",
    template: "%s | Verdant",
  },
  description:
    "A shared workspace for residents, estate payments and gate access. Verdant is an estate-management product demonstration for Nigeria.",
  openGraph: {
    title: "Verdant | Estate life, together",
    description:
      "Less admin. More living. Residents, estate payments and gate access in one workspace.",
    type: "website",
  },
  robots: { index: false, follow: true },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body id="top">
        <a className="skip-link" href="#main-content">
          Skip to main content
        </a>
        <div className="scroll-progress" aria-hidden="true" />
        {children}
        <CookiePreferences banner />
        <BackToTop />
      </body>
    </html>
  );
}
