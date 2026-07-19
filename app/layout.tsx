import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { OfflineBanner } from "@/src/components/layout/OfflineBanner";
import { CapacityNotice } from "@/src/components/resilience/CapacityNotice";
import { WebVitalsReporter } from "@/lib/webVitals";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AgriTrust Protocol",
  description:
    "Decentralized agricultural trust fund management on Stellar Soroban",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "AgriTrust",
  },
  icons: {
    apple: "/icons/icon-192.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#1A7D36",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {/* Offline status banner — renders above all content when offline */}
        <Providers>
          <OfflineBanner />
          <WebVitalsReporter />
          <CapacityNotice />
          {children}
        </Providers>
      </body>
    </html>
  );
}
