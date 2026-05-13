import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { PasswordGate } from "./components/PasswordGate";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "WFM Forecasting Demo",
  description: "Interactive workforce management forecasting engine using Erlang C",
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
      // The page must NEVER scroll vertically, the cockpit owns the viewport
      // and pins its KPI strip at the bottom. If the document grows past
      // 100vh, the page scrolls and the KPI strip ends up below the fold
      // (Round 5/5.5 bug). Lock both html and body to the viewport.
      style={{ height: '100%', overflow: 'hidden' }}
    >
      <body
        className="flex flex-col"
        style={{ height: '100%', overflow: 'hidden', margin: 0 }}
      >
        <PasswordGate>{children}</PasswordGate>
      </body>
    </html>
  );
}
