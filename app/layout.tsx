import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import "@/app/globals.css";
import { SiteHeader } from "@/components/site-header";
import { ToastProvider } from "@/components/ui/toast";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "flux.ai",
  description: "Prompt-to-schematic workspace for AI-assisted hardware design."
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <ToastProvider>
          <div className="min-h-screen">
            <SiteHeader />
            <main>{children}</main>
          </div>
        </ToastProvider>
      </body>
    </html>
  );
}
