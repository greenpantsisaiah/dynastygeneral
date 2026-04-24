"use client";

import { useEffect } from "react";
import "./globals.css";
import { Geist, Geist_Mono } from "next/font/google";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("[global-error]", error);
  }, [error]);

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-[#0a0a0a] text-[#e5e5e5]">
        <main className="flex flex-1 items-center justify-center px-6">
          <div className="max-w-md text-center">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#ef4444]">
              Error
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              Something went wrong
            </h1>
            <p className="mt-4 text-sm text-[#737373]">
              A critical error occurred. Try again or refresh the page.
            </p>
            <div className="mt-8 flex items-center justify-center gap-3">
              <button
                onClick={() => unstable_retry()}
                className="inline-flex h-10 items-center rounded-md bg-[#00e5a0] px-5 text-sm font-semibold text-black transition hover:brightness-110"
              >
                Try again
              </button>
              <a
                href="/"
                className="inline-flex h-10 items-center rounded-md border border-[#2a2a2a] bg-[#141414] px-5 text-sm font-medium transition hover:border-[#00e5a0]/60"
              >
                Go home
              </a>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
