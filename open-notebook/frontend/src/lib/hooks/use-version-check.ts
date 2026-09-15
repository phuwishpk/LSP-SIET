/**
 * Version-update notification – DISABLED for the KMITL / SIET Space workspace.
 *
 * Upstream Open Notebook shows a "Version X available – View on GitHub" toast
 * on every dashboard page. That is noise for students, so the hook is kept as
 * a no-op so any caller keeps compiling but nothing is ever displayed.
 */
export function useVersionCheck() {
  // intentionally empty
}
