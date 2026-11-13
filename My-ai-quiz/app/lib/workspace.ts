/**
 * Bridge to SIET Space (the main app).
 *
 * SIET Space opens this app with `?token=<JWT>` (and `?theme=`, see theme.ts).
 * The token is kept in localStorage - under the same key as the AI Roadmap
 * app, so behind the proxy both apps share it - and removed from the address
 * bar by LaunchParams. Every API call goes through this app's own server
 * (`/quiz/api/ws/...`) with that token; the API does all the checks.
 */

/**
 * Browser-facing URL of the KMITL workspace (open-notebook Next.js app).
 *
 * `NEXT_PUBLIC_WORKSPACE_URL` wins when it was baked into the build, then the
 * SIET Space this app was opened from (WORKSPACE_ORIGIN_KEY). Otherwise we infer
 * it: when this app is served on its own port (3001) the workspace is on port
 * 3000 of the same host; when it is served behind Traefik under `/quiz`, the
 * workspace is the site root.
 */
export function getWorkspaceUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_WORKSPACE_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  if (typeof window === 'undefined') return 'http://localhost:3000';
  const { protocol, hostname, port, origin } = window.location;
  try {
    const learned = window.localStorage.getItem(WORKSPACE_ORIGIN_KEY);
    if (learned && new URL(learned).hostname === hostname) return learned;
  } catch {}
  if (port === '3001') return `${protocol}//${hostname}:3000`;
  return origin;
}

/**
 * The SIET Space this app was last opened from (its `return` link, kept by
 * LaunchParams; same key as the AI Roadmap app and the shared navbar). Several
 * copies can share this app - prod :3000 and the test stack :18502 both use :3001.
 */
export const WORKSPACE_ORIGIN_KEY = 'kmitlai-workspace-origin';

export const TOKEN_STORAGE_KEY = 'kmitlai-workspace-token';
const BASE_PATH = '/quiz';

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

export class ApiError extends Error {
  status: number;
  data: unknown;
  headers: Headers | null;

  constructor(status: number, message: string, data: unknown = null, headers: Headers | null = null) {
    super(message);
    this.status = status;
    this.data = data;
    this.headers = headers;
  }
}

/** FastAPI puts a string in `detail`, or a list of field errors for a 422. */
function detailOf(data: unknown, fallback: string): string {
  const detail = data && typeof data === 'object' ? (data as { detail?: unknown; error?: unknown }).detail ?? (data as { error?: unknown }).error : data;
  if (typeof detail === 'string' && detail.trim()) return detail;
  if (Array.isArray(detail)) return detail.map((item) => item?.msg || JSON.stringify(item)).join(' · ');
  return fallback;
}

/**
 * Call this app's server: `api('ws/community/me')` reaches the SIET Space API
 * through the relay, `api('generate-quiz', ...)` the quiz generator.
 */
export async function api<T = unknown>(
  path: string,
  { method = 'GET', json }: { method?: string; json?: unknown } = {}
): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getWorkspaceToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (json !== undefined) headers['Content-Type'] = 'application/json';

  let response: Response;
  try {
    response = await fetch(`${BASE_PATH}/api/${path}`, {
      method,
      headers,
      body: json === undefined ? undefined : JSON.stringify(json),
    });
  } catch {
    throw new ApiError(0, 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ลองใหม่อีกครั้ง');
  }
  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!response.ok) {
    const fallback =
      response.status === 401
        ? 'เซสชันหมดอายุ กรุณาเปิดแอปนี้ใหม่จาก SIET Space'
        : `เกิดข้อผิดพลาด (HTTP ${response.status})`;
    throw new ApiError(response.status, detailOf(data, fallback), data, response.headers);
  }
  return data as T;
}
