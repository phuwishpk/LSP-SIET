// Route groups such as `(dashboard)` do not become URL segments. Re-export
// the workspace home here so post-login navigation to /dashboard resolves to
// the existing dashboard UI while retaining the dashboard layout/auth guard.
export { default } from '../page'
