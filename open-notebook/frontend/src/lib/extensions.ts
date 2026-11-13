/**
 * Extension points for UI that lives outside open-notebook's frontend.
 *
 * Installed extensions are listed in ./extensions.installed (KMITL: the SIET
 * packages). Upstream files call the functions below at a few documented
 * places (docs/UPSTREAM.md, "hook points"); with nothing installed every call
 * leaves open-notebook's behaviour unchanged.
 *
 * - navigation  useNavigationExtensions(sections): reshape the sidebar
 * - gates       useGate(name): hide a built-in feature (hooks, called every render)
 * - slots       getSlot(name): replace or add a component
 * - route gate  useRouteGate(pathname): keep a user out of a page
 * - i18n        extendI18n(i18n): extra or overriding translations
 * - events      emitExtensionEvent(name, payload): fire-and-forget notifications
 */
import type { ComponentType } from 'react'

import { installed } from './extensions.installed'

export interface ExtensionNavItem {
  name: string
  href: string
  icon: ComponentType<{ className?: string }>
  iconClass?: string
}

export interface ExtensionNavSection {
  title: string
  items: readonly ExtensionNavItem[]
}

export interface RouteDecision {
  /** false while the gate cannot decide yet (e.g. the user is still loading) */
  ready: boolean
  /** where to send the user instead, if anywhere */
  redirect?: string
}

export interface FrontendExtension {
  /** A hook: may read stores. Gets the sections built so far. */
  useNavigation?: (sections: readonly ExtensionNavSection[]) => readonly ExtensionNavSection[]
  /** Hooks returning false to hide a built-in feature. */
  gates?: Record<string, () => boolean>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- each slot has its own props
  slots?: Record<string, ComponentType<any>>
  /** A hook deciding whether the current user may see `pathname`. */
  useRouteGate?: (pathname: string) => RouteDecision
  /** language code -> translation resources, deep-merged over the built-in ones */
  translations?: Record<string, Record<string, unknown>>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- each event has its own payload
  events?: Record<string, (payload: any) => void>
}

const extensions: readonly FrontendExtension[] = installed

export function useNavigationExtensions(
  sections: readonly ExtensionNavSection[]
): readonly ExtensionNavSection[] {
  let result = sections
  for (const extension of extensions) {
    if (extension.useNavigation) result = extension.useNavigation(result)
  }
  return result
}

export function useGate(name: string): boolean {
  let open = true
  for (const extension of extensions) {
    const gate = extension.gates?.[name]
    if (gate && !gate()) open = false
  }
  return open
}

export function getSlot<P = Record<string, never>>(name: string): ComponentType<P> | null {
  for (const extension of extensions) {
    const slot = extension.slots?.[name]
    if (slot) return slot as ComponentType<P>
  }
  return null
}

export function useRouteGate(pathname: string): RouteDecision {
  let decision: RouteDecision = { ready: true }
  for (const extension of extensions) {
    if (!extension.useRouteGate) continue
    const next = extension.useRouteGate(pathname)
    if (!next.ready) decision = { ready: false }
    else if (decision.ready && next.redirect && !decision.redirect) decision = next
  }
  return decision
}

export function extendI18n(i18n: {
  addResourceBundle: (lng: string, ns: string, resources: unknown, deep?: boolean, overwrite?: boolean) => unknown
}): void {
  for (const extension of extensions) {
    for (const [language, resources] of Object.entries(extension.translations ?? {})) {
      i18n.addResourceBundle(language, 'translation', resources, true, true)
    }
  }
}

export function emitExtensionEvent(name: string, payload?: unknown): void {
  for (const extension of extensions) {
    const handler = extension.events?.[name]
    if (!handler) continue
    try {
      handler(payload)
    } catch (error) {
      console.error(`extension event "${name}" failed`, error)
    }
  }
}
