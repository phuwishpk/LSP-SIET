import type { Metadata } from "next";
import "./globals.css";
import { Navbar } from "@shared/components/Navbar";

export const metadata: Metadata = {
  title: "SIET Space AI Quiz Arena",
  description: "AI-powered adaptive learning quiz arena for SIET Space",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th" className="h-full antialiased">
      <body className="flex h-screen flex-col overflow-hidden bg-[#f8fafc] text-[#0f172a] antialiased font-sans">
        <div className="relative z-[100] shrink-0">
          <Navbar />
        </div>
        <div className="relative z-0 flex-1 min-h-0 overflow-y-auto">
          {children}
        </div>
      </body>
    </html>
  );
}
