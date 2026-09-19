import type { Metadata } from "next";
import "./globals.css";
import { getAppEnv } from "@/lib/env";

export const metadata: Metadata = {
  title: "Internal ops tools",
  description: "Shared foundation for internal fintech operations tools",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const env = getAppEnv();
  return (
    <html lang="en">
      <body>
        {env !== "production" && (
          <div className={`env-banner env-${env}`} role="status">
            {env.toUpperCase()} environment
            {env === "development" ? "" : " — test data only; no real customers"}
          </div>
        )}
        {children}
      </body>
    </html>
  );
}
