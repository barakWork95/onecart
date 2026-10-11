import type { Metadata, Viewport } from "next";
import { Geist_Mono, Plus_Jakarta_Sans } from "next/font/google";
import { AppHeader } from "@/components/layout/app-header";
import { BottomNav } from "@/components/layout/bottom-nav";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "OneCart — Find the best price", template: "%s · OneCart" },
  description:
    "Search Amazon, AliExpress, Temu and eBay at once. Compare the real landed price to Israel — shipping, VAT and customs included.",
  icons: { icon: "/brand/onecart-icon.png", apple: "/brand/onecart-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#1a5fe0",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${jakarta.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <AppHeader />
        {children}
        <BottomNav />
      </body>
    </html>
  );
}
