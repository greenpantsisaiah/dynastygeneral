import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Dynasty Copilot: Win the decision in front of you.",
  description:
    "A Sleeper-first dynasty decision copilot. Remembers your strategy, detects leverage, and helps you act with conviction on picks, trades, and counters.",
  metadataBase: new URL("http://localhost:3000"),
  openGraph: {
    title: "Dynasty Copilot",
    description:
      "Win the decision in front of you. A dynasty copilot for serious Sleeper players.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
