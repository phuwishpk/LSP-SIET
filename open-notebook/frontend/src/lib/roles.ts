/**
 * Which parts of the workspace each role may see.
 *
 * Mirrors the server-side policy in `api/auth_roles.py`; the backend is the
 * enforcement point, this is only so students are not shown doors that are
 * locked (and so shared components do not call APIs that would 403).
 */
export type Role = 'student' | 'teacher' | 'admin' | null | undefined

/** Teachers prepare material in the Open Notebook surface; students do not. */
export function isStaff(role: Role): boolean {
  return role === 'teacher' || role === 'admin'
}

/** Model configuration and API credentials belong to admins only. */
export function isAdmin(role: Role): boolean {
  return role === 'admin'
}

/** Route prefixes a student must never land on. */
export const STAFF_ROUTES = [
  '/notebooks',
  '/sources',
  '/search',
  '/podcasts',
  '/transformations',
  '/advanced',
  '/settings',
] as const

export const ADMIN_ROUTES = ['/settings', '/advanced'] as const

export function canAccessRoute(role: Role, pathname: string): boolean {
  const matches = (routes: readonly string[]) =>
    routes.some((r) => pathname === r || pathname.startsWith(r + '/'))
  if (matches(ADMIN_ROUTES)) return isAdmin(role)
  if (matches(STAFF_ROUTES)) return isStaff(role)
  return true
}
