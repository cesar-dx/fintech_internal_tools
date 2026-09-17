import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Internal ops tools",
  description: "Shared foundation for internal fintech operations tools",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
