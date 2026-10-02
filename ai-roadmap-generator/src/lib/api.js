import { BASE_PATH, getToken, redirectToLogin } from './workspace'

export class ApiError extends Error {
  constructor(status, message, { headers, data, redirected = false } = {}) {
    super(message)
    this.status = status
    this.headers = headers
    this.data = data
    // True when a 401 already sent the browser off to sign in.
    this.redirected = redirected
  }
}

/** FastAPI puts a string in `detail`, or a list of field errors for a 422. */
function detailOf(data, fallback) {
  const detail = data && typeof data === 'object' ? data.detail ?? data.message : data
  if (typeof detail === 'string' && detail.trim()) return detail
  if (Array.isArray(detail)) {
    return detail.map((item) => item?.msg || JSON.stringify(item)).join(' · ')
  }
  return fallback
}

/**
 * Call the SIET Space API through this app's own server (`/api/ws/...`), so
 * the browser never needs the API's address. `path` is the part after `/api/`.
 */
export async function ws(path, { method = 'GET', json, form, signal } = {}) {
  const headers = {}
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  let body
  if (json !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(json)
  } else if (form) {
    body = form
  }

  let response
  try {
    response = await fetch(`${BASE_PATH}/api/ws/${path}`, { method, headers, body, signal })
  } catch (error) {
    if (error?.name === 'AbortError') throw error
    throw new ApiError(0, 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ลองใหม่อีกครั้ง')
  }

  const text = await response.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }

  if (response.status === 401) {
    const redirected = redirectToLogin()
    throw new ApiError(401, 'กรุณาเข้าสู่ระบบผ่าน SIET Space', { headers: response.headers, data, redirected })
  }
  if (!response.ok) {
    throw new ApiError(response.status, detailOf(data, `เกิดข้อผิดพลาด (${response.status})`), {
      headers: response.headers,
      data,
    })
  }
  return data
}

/** Path segment for a record id such as `roadmap_session:abc`. */
export const seg = (value) => encodeURIComponent(String(value))
