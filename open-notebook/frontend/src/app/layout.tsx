import type { Metadata } from "next";
import { IBM_Plex_Sans_Thai, Inter, Noto_Sans_Thai } from "next/font/google";
import "./globals.css";
import "katex/dist/katex.min.css";
import { Toaster } from "@/components/ui/sonner";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { ConnectionGuard } from "@/components/common/ConnectionGuard";
import { themeScript } from "@/lib/theme-script";
import { I18nProvider } from "@/components/providers/I18nProvider";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

// Thai faces for the SIET theme (`.theme-siet` in globals.css). Only the CSS
// variables are set here; without preload the files are fetched by the pages
// that actually use the family. Noto Sans Thai is a variable font and must stay
// without a weight list: Turbopack fails to resolve its files when one is given.
const plexThai = IBM_Plex_Sans_Thai({
  weight: ["400", "500", "600"],
  variable: "--font-ibm-plex-thai",
  preload: false,
});
const notoThai = Noto_Sans_Thai({
  variable: "--font-noto-thai",
  preload: false,
});

export const metadata: Metadata = {
  title: "Open Notebook",
  description: "Privacy-focused research and knowledge management",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={`${inter.className} ${inter.variable} ${plexThai.variable} ${notoThai.variable}`}>
        <ErrorBoundary>
          <ThemeProvider>
            <QueryProvider>
              <I18nProvider>
                <ConnectionGuard>
                  {children}
                  <Toaster />
                </ConnectionGuard>
              </I18nProvider>
            </QueryProvider>
          </ThemeProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
