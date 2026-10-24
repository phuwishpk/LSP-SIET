/**
 * /admin pages wear the same pink palette as the rest of the dashboard, set on
 * <body> by useCommunityPalette (lib/hooks/use-community-palette.ts).
 *
 * Until 23 Oct 2026 this layout put the admin pages in `.theme-siet` (minimal
 * monochrome). The class is still in siet-theme.css but nothing applies it.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children
}
