/**
 * Browser-facing URL of the KMITL workspace (open-notebook Next.js app).
 *
 * `NEXT_PUBLIC_WORKSPACE_URL` wins when it was baked into the build. Otherwise
 * we infer it: when this app is served on its own port (3001) the workspace is
 * on port 3000 of the same host; when it is served behind Traefik under
 * `/quiz`, the workspace is the site root.
 */
export function getWorkspaceUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_WORKSPACE_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  if (typeof window === 'undefined') return 'http://localhost:3000';
  const { protocol, hostname, port, origin } = window.location;
  if (port === '3001') return `${protocol}//${hostname}:3000`;
  return origin;
}

export const TOKEN_STORAGE_KEY = 'kmitlai-workspace-token';

export function getWorkspaceToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_STORAGE_KEY);
}
