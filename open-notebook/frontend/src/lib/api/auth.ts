/**
 * Auth API client for the workspace.
 *
 * The endpoints here target the open-notebook FastAPI backend, which acts
 * as the single auth source for My-ai-quiz + ai-roadmap-generator.
 */

export interface AuthUser {
  id: string
  username: string
  display_name?: string | null
  created_at?: string | null
  last_login_at?: string | null
}

export interface AuthStatus {
  jwt_auth_enabled: boolean
  registration_enabled: boolean
  auth_required: boolean
  user?: AuthUser | null
}

export interface TokenResponse {
  access_token: string
  token_type: string
  expires_at: number
  user: AuthUser
}

export interface LoginPayload {
  username: string
  password: string
}

export interface RegisterPayload {
  username: string
  password: string
  display_name?: string
}

class AuthApiError extends Error {
  status: number
  detail: string
  constructor(message: string, status: number, detail: string) {
    super(message)
    this.status = status
    this.detail = detail
  }
}

async function postJson<T>(
  url: string,
  body: unknown,
  options: { token?: string } = {}
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (options.token) {
    headers['Authorization'] = `Bearer ${options.token}`
  }
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    let detail = `HTTP ${response.status}`
    try {
      const data = await response.json()
      if (data && typeof data === 'object' && typeof data.detail === 'string') {
        detail = data.detail
      }
    } catch {
      // ignore parse errors
    }
    throw new AuthApiError(detail, response.status, detail)
  }
  return (await response.json()) as T
}

async function getJson<T>(url: string, token?: string): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  const response = await fetch(url, { method: 'GET', headers })
  if (!response.ok) {
    let detail = `HTTP ${response.status}`
    try {
      const data = await response.json()
      if (data && typeof data === 'object' && typeof data.detail === 'string') {
        detail = data.detail
      }
    } catch {
      // ignore
    }
    throw new AuthApiError(detail, response.status, detail)
  }
  return (await response.json()) as T
}

export const authApi = {
  status: (apiUrl: string) => getJson<AuthStatus>(`${apiUrl}/api/auth/status`),

  login: (apiUrl: string, payload: LoginPayload) =>
    postJson<TokenResponse>(`${apiUrl}/api/users/login`, payload),

  register: (apiUrl: string, payload: RegisterPayload) =>
    postJson<TokenResponse>(`${apiUrl}/api/users/register`, payload),

  logout: (apiUrl: string, token: string) =>
    postJson<{ ok: boolean }>(`${apiUrl}/api/users/logout`, {}, { token }),

  me: (apiUrl: string, token: string) =>
    getJson<AuthUser>(`${apiUrl}/api/users/me`, token),
}

export { AuthApiError }