import type { Metadata, Viewport } from "next";
import { Inter, Poppins } from "next/font/google";

import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "NCC Portal — NIFCO Customer Claim",
    template: "%s · NCC Portal",
  },
  description:
    "Customer Complaint Handling Portal PT Nifco Indonesia — pencatatan klaim, CPAR, dan monitoring CAPA.",
};

export const viewport: Viewport = {
  themeColor: "#e8873a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <body className={`${inter.variable} ${poppins.variable}`}>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
