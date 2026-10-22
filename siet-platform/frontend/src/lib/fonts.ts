import { IBM_Plex_Sans_Thai, Inter, Noto_Sans_Thai, Nunito } from 'next/font/google'

// The SIET themes (siet-theme.css) refer to these through CSS variables, which
// are set on <body> so portaled dialogs see them too.
const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
// DESIGN.md's display face for the AI Learning Adventure theme (Latin only;
// Thai falls back to IBM Plex Sans Thai through the font stack).
const nunito = Nunito({ subsets: ['latin'], variable: '--font-nunito' })
// Thai faces for the SIET theme (`.theme-siet`). Only the CSS variables are
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

export const sietFontVariables = [inter, plexThai, notoThai, nunito].map((f) => f.variable).join(' ')
