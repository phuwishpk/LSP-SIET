import type { Metadata } from "next";
import "./globals.css";
import { LaunchParams } from "./components/LaunchParams";
import { ThemeWatcher } from "./components/ThemeWatcher";
import { WorkspaceNavbar } from "./components/WorkspaceNavbar";
import { themeBootScript } from "./lib/theme";

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
    <html lang="th" data-theme="light" suppressHydrationWarning className="h-full antialiased">
      <head>
        {/* SIET Space's light / dark choice, set before the first paint (see lib/theme.ts). */}
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&family=IBM+Plex+Sans+Thai:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="flex h-screen flex-col overflow-hidden bg-[#f8fafc] text-[#0f172a] antialiased font-sans">
        <LaunchParams />
        <ThemeWatcher />
        <div className="relative z-[100] shrink-0" style={{ height: '64px', minHeight: '64px' }}>
          <WorkspaceNavbar />
        </div>
        <div className="relative z-0 flex-1 min-h-0 overflow-y-auto">
          {children}
        </div>
      </body>
    </html>
  );
}
