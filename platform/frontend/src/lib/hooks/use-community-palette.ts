'use client'

import { useLayoutEffect } from 'react'

/**
 * Every dashboard page wears the community pink palette (`.community-theme` in
 * siet-theme.css) instead of open-notebook's green, admin and notebook pages
 * included, and the SIET Pink workspace theme (`.theme-siet`, PR #38: cards,
 * sidebar, forms, dialogs, the dashboard hero).
 *
 * The class goes on <body>, so the page, the sidebar, the navbar and the
 * dialogs, menus and tooltips that Radix portals to <body> all pick it up.
 * The dashboard layout stays mounted while moving between its pages, so the
 * class is only dropped when leaving the dashboard (e.g. for /login).
 */
export function useCommunityPalette() {
  useLayoutEffect(() => {
    document.body.classList.add('community-theme', 'theme-siet')
    return () => document.body.classList.remove('community-theme', 'theme-siet')
  }, [])
}
