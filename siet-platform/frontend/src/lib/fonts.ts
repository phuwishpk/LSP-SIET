import { IBM_Plex_Sans_Thai, Inter, Noto_Sans_Thai, Nunito, Prompt } from 'next/font/google'

// The SIET themes (siet-theme.css) refer to these through CSS variables, which
// are set on <body> so portaled dialogs see them too.
const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
// DESIGN.md's display face for the AI Learning Adventure theme (Latin only;
// Thai falls back to IBM Plex Sans Thai through the font stack).
const nunito = Nunito({ subsets: ['latin'], variable: '--font-nunito' })
// Thai faces for the SIET themes (`.community-theme` on every dashboard page,
// `.theme-adventure` on /community/ask). Only the CSS variables are
// set here; without preload the files are fetched by the pages that actually
// use the family. Noto Sans Thai is a variable font and must stay without a
// weight list: Turbopack fails to resolve its files when one is given.
const plexThai = IBM_Plex_Sans_Thai({
  weight: ['400', '500', '600'],
  variable: '--font-ibm-plex-thai',
  preload: false,
})
const notoThai = Noto_Sans_Thai({
  variable: '--font-noto-thai',
  preload: false,
})

// SIET Pink's Thai face (DESIGN.md, PR #38): after Nunito for Latin, before the
// other Thai fallbacks. next/font self-hosts it like the faces above.
const prompt = Prompt({
  subsets: ['thai', 'latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-prompt',
  preload: false,
})

export const sietFontVariables = [inter, plexThai, notoThai, nunito, prompt].map((f) => f.variable).join(' ')
