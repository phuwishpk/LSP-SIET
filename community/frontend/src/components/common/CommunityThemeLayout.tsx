/**
 * Layout of /teacher and /community/search. Every dashboard page is already
 * pink: `.community-theme` sits on <body> (useCommunityPalette in
 * @siet/platform), so this adds nothing of its own.
 *
 * It must not add or remove that class itself. Removing it on leaving the
 * route would strip the palette from the page you go to next.
 */
export default function CommunityThemeLayout({ children }: { children: React.ReactNode }) {
  return children
}
