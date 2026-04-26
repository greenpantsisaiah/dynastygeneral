import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { FeedbackWidget } from "@/components/feedback/feedback-widget";
import { WhatsNewRibbon } from "@/components/whats-new-ribbon";
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
  title: {
    default: "Dynasty General: Win the decision in front of you.",
    template: "%s · Dynasty General",
  },
  description:
    "Decision engine for serious dynasty fantasy football managers on Sleeper. Pick recommendations with named-player reasoning, trade evaluation against KTC market values, and live strategy coaching.",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "https://dynastygeneral.app",
  ),
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/apple-icon.png",
  },
  manifest: "/manifest.json",
  openGraph: {
    title: "Dynasty General",
    description:
      "Win the decision in front of you. Decision engine for Sleeper dynasty leagues with named-player reasoning, KTC-anchored trade evaluation, and strategy coaching.",
    type: "website",
    siteName: "Dynasty General",
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "Dynasty General",
    description:
      "Decision engine for Sleeper dynasty leagues. Pick recommendations, trade evaluation, and strategy coaching with evidence cited per call.",
  },
  robots: {
    index: true,
    follow: true,
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
        <WhatsNewRibbon />
        <FeedbackWidget signedInEmail={user?.email ?? null} />
      </body>
    </html>
  );
}
