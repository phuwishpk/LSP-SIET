'use client'

import { useLayoutEffect } from 'react'

/**
 * Puts a whole route, sidebar included, in the community pink palette
 * (`.community-theme` in siet-theme.css) instead of open-notebook's green.
 *
 * The wrapper themes the page itself. Dialogs, menus and tooltips are portaled
 * to <body>, outside the wrapper, so the class is also set there for as long as
 * the route is open (the same pattern as the /admin layout).
 */
export default function CommunityThemeLayout({ children }: { children: React.ReactNode }) {
  useLayoutEffect(() => {
    document.body.classList.add('community-theme')
    return () => document.body.classList.remove('community-theme')
  }, [])

  return <div className="community-theme">{children}</div>
}
