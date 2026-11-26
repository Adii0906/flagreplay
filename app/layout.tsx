import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

export const metadata: Metadata = {
  title: "FlagReplay: feature flag incident investigator",
  description: "Understand what changed. Find what broke. Recover with confidence.",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = { themeColor: "#0c0c0d", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
