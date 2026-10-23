import { Html, Head, Main, NextScript } from 'next/document'
import { themeBootScript } from '@/lib/theme'

export default function Document() {
  return (
    <Html lang="th">
      <Head>
        <link rel="icon" href="/roadmap/favicon.svg" />
        <meta name="description" content="AI Roadmap ของ SIET Space: สร้างแผนการเรียนจากคลังความรู้ของรายวิชา" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* DESIGN.md: Nunito for Latin/digits (Thai falls back to IBM Plex Sans Thai) */}
        <link
          href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&family=IBM+Plex+Sans+Thai:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </Head>
      <body>
        {/* Light / dark before the first paint, so a dark-theme visit does not flash white. */}
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}
