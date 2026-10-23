/**
 * Browser-facing URL of the KMITL workspace (open-notebook Next.js app).
 *
 * `NEXT_PUBLIC_WORKSPACE_URL` wins when it was baked into the build. Otherwise
 * we infer it: when this app is served on its own port (3001) the workspace is
 * on port 3500 of the same host; when it is served behind Traefik under
 * `/quiz`, the workspace is the site root.
 */
export function getWorkspaceUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_WORKSPACE_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  if (typeof window === 'undefined') return 'http://localhost:3500';
  const { protocol, hostname, port, origin } = window.location;
  if (port === '3001' || port === '3002' || port === '3000') return `${protocol}//${hostname}:3500`;
  return origin;
}

export const TOKEN_STORAGE_KEY = 'kmitlai-workspace-token';

/**
 * The token SIET Space handed over: from the address bar on arrival (then kept),
 * else the one kept, else SIET Space's own when both apps share one origin
 * behind the proxy.
 */
export function getWorkspaceToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const fromLink = new URLSearchParams(window.location.search).get('token');
    if (fromLink) {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, fromLink);
      return fromLink;
    }
    return (
      window.localStorage.getItem(TOKEN_STORAGE_KEY) ||
      JSON.parse(window.localStorage.getItem('auth-storage') || 'null')?.state?.token ||
      null
    );
  } catch {
    return null;
  }
}
