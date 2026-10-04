import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AgriTrust Protocol · Sovereignty Portal",
  description:
    "Operator and farmer sovereignty portal for the AgriTrust Protocol: supply chain " +
    "lineage graphs, EUDR compliance certification and executable ODRL data contracts.",
  applicationName: "AgriTrust Protocol",
};

export const viewport: Viewport = {
  themeColor: "#070b0f",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="min-h-screen antialiased">
        <div className="relative flex min-h-screen flex-col">
          {/*
            Ambient field backdrop. Decorative only, so it is hidden from
            assistive technology and from print.
          */}
          <div
            aria-hidden="true"
            className="pointer-events-none fixed inset-0 -z-10 opacity-60"
            style={{
              backgroundImage:
                "radial-gradient(900px circle at 12% -8%, rgba(52, 211, 153, 0.10), transparent 55%)," +
                "radial-gradient(800px circle at 88% 0%, rgba(56, 189, 248, 0.09), transparent 55%)," +
                "radial-gradient(700px circle at 50% 110%, rgba(167, 139, 250, 0.07), transparent 60%)",
            }}
          />
          {children}
        </div>
      </body>
    </html>
  );
}