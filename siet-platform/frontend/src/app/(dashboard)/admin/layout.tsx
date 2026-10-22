'use client'

import { useLayoutEffect } from 'react'

/**
 * Every /admin page wears the SIET minimal theme (`.theme-siet` in globals.css).
 *
 * The wrapper themes the page itself. Dialogs, menus and tooltips are portaled
 * to <body>, outside the wrapper, so the class is also set there for as long as
 * an admin page is open.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  useLayoutEffect(() => {
    document.body.classList.add('theme-siet')
    return () => document.body.classList.remove('theme-siet')
  }, [])

  return <div className="theme-siet bg-canvas">{children}</div>
}
