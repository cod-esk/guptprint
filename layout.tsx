import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GuptPrint — Scan. Pay. Print.",
  description: "Private self-print for Indian print shops.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
