import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DebAI · Debate Trajectory Control",
  description: "Debate an AI opponent while an AI judge scores every point. The better argument boosts your rocket.",
};

const FONTS =
  "https://fonts.googleapis.com/css2?family=Bodoni+Moda:wght@400;500&family=Barlow:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href={FONTS} />
      </head>
      <body>{children}</body>
    </html>
  );
}
