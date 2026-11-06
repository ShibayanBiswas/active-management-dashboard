import type { Metadata, Viewport } from "next";

import { AppShell } from "@/components/layout/app-shell";
import { EmbedNavigation } from "@/components/layout/embed-navigation";
import { DeskProvider } from "@/lib/context/desk-provider";
import { ThemeProvider } from "@/lib/context/theme-provider";

import "./globals.css";

const themeInitScript = `(function(){try{var t=localStorage.getItem("am-theme");if(t==="dark"){document.documentElement.classList.add("dark");document.documentElement.style.colorScheme="dark";}}catch(e){}})();`;

export const metadata: Metadata = {
  title: "Active Management Dashboard | Anand Rathi Wealth",
  description: "Whole-book active management desk: observations, residual targets, capped IRRs, scenario ladder and expected difference at maturity.",
  icons: { icon: "/brand/arwl-logo.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf7f0" },
    { media: "(prefers-color-scheme: dark)", color: "#12100c" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="bg-background font-serif text-ink antialiased">
        <ThemeProvider>
          <DeskProvider>
            <EmbedNavigation />
            <AppShell>{children}</AppShell>
          </DeskProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
