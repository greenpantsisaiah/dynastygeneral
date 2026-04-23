import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { FeedbackWidget } from "@/components/feedback/feedback-widget";
import { getOptionalUser } from "@/lib/auth/session";

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
    "A dynasty decision copilot. Sleeper today, MyFantasyLeague next. Remembers your strategy, detects leverage, and helps you act with conviction on picks, trades, and counters.",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "https://dynastygeneral.app",
  ),
  openGraph: {
    title: "Dynasty Copilot",
    description:
      "Win the decision in front of you. A dynasty copilot for serious dynasty managers. Sleeper today, MyFantasyLeague next.",
    type: "website",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Best-effort attribution. If the user is signed in, we surface their
  // email in the feedback widget so they don't have to retype it AND so
  // they see "we know it's you" before submitting (consent transparency
  // per the security-audit MEDIUM finding from 2026-04-23).
  const user = await getOptionalUser();
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <FeedbackWidget signedInEmail={user?.email ?? null} />
      </body>
    </html>
  );
}
