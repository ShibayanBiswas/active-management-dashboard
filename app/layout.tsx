import type { Metadata, Viewport } from "next";

import { EmbedNavigation } from "@/components/layout/embed-navigation";
import { DeskKeyProvider } from "@/lib/context/desk-key-provider";
import { MultiDatasetProvider } from "@/lib/context/multi-desk-provider";
import { ThemeProvider } from "@/lib/context/theme-provider";

import "./globals.css";

const themeInitScript = `(function(){try{var t=localStorage.getItem("uc-theme");if(t==="dark"){document.documentElement.classList.add("dark");document.documentElement.style.colorScheme="dark";}else{document.documentElement.classList.remove("dark");document.documentElement.style.colorScheme="light";}}catch(e){}})();`;

export const metadata: Metadata = {
  title: "Active Management Dashboard | Anand Rathi Wealth",
  description:
    "Structured product unwinding calculator — redeem value, option book marks, and internal rates of return as of any unwinding date.",
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
          <DeskKeyProvider>
            <MultiDatasetProvider>
              <EmbedNavigation />
              {children}
            </MultiDatasetProvider>
          </DeskKeyProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
