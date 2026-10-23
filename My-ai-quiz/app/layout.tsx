import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { LaunchParams } from "./components/LaunchParams";
import { ThemeWatcher } from "./components/ThemeWatcher";
import { themeBootScript } from "./lib/theme";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AI Quiz · SIET Space",
  description: "แบบทดสอบ AI จากคลังความรู้ของรายวิชา",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-theme="light"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* SIET Space's light / dark choice, set before the first paint (see lib/theme.ts). */}
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body className="min-h-full flex flex-col">
        <LaunchParams />
        <ThemeWatcher />
        {children}
      </body>
    </html>
  );
}
