import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { PwaRegister } from "@/components/pwa/pwa-register";
import { OfflineNotice } from "@/components/pwa/offline-notice";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AlphaAi Accounting - Intelligent VAT Tracking for Modern Businesses",
  description: "AI-powered bookkeeping for modern businesses. Track transactions, calculate VAT, scan receipts with OCR, and export to Peppol e-invoicing format.",
  keywords: ["AI Accounting", "Bookkeeping", "VAT", "Moms", "Small Business", "Denmark", "Peppol", "E-invoicing", "OCR", "Receipt Scanning"],
  authors: [{ name: "AlphaAi" }],
  icons: {
    icon: "/logo.png",
    apple: "/logo.svg",
  },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "AlphaAi",
  },
};

export const viewport: Viewport = {
  themeColor: "#554fe9",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <OfflineNotice />
        <PwaRegister />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
