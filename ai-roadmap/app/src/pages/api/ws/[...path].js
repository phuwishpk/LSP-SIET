/**
 * Server-side relay to the SIET Space API (Open Notebook).
 *
 * The browser calls `/roadmap/api/ws/<path>`; this forwards it to
 * `${OPEN_NOTEBOOK_API_URL}/api/<path>` with the caller's Authorization header.
 * The API does all the authentication and permission checks - this only keeps
 * the browser from needing the API's address (which differs per deployment).
 */

export const config = { api: { bodyParser: false, responseLimit: false } }

// Only what this app uses.
const ALLOWED = [/^community\//, /^users\/me$/]
const REQUEST_HEADERS = ['authorization', 'content-type', 'accept']
const RESPONSE_HEADERS = [
  'content-type',
  'retry-after',
  'x-points-required',
  'x-points-balance',
  'x-points-kind',
  'x-duplicate-of',
]

async function readBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  return Buffer.concat(chunks)
}

export default async function handler(req, res) {
  const base = process.env.OPEN_NOTEBOOK_API_URL
  if (!base) {
    return res.status(500).json({ detail: 'OPEN_NOTEBOOK_API_URL is not set for the roadmap app' })
  }
  const segments = [].concat(req.query.path || [])
  const path = segments.join('/')
  if (!ALLOWED.some((rule) => rule.test(path))) {
    return res.status(404).json({ detail: 'Not found' })
  }

  const queryStart = req.url.indexOf('?')
  const search = queryStart >= 0 ? req.url.slice(queryStart) : ''
  const target = `${base.replace(/\/$/, '')}/api/${segments.map(encodeURIComponent).join('/')}${search}`

  const headers = {}
  for (const name of REQUEST_HEADERS) {
    if (req.headers[name]) headers[name] = req.headers[name]
  }
  const hasBody = !['GET', 'HEAD'].includes(req.method)

  try {
    const upstream = await fetch(target, {
      method: req.method,
      headers,
      body: hasBody ? await readBody(req) : undefined,
    })
    res.status(upstream.status)
    for (const name of RESPONSE_HEADERS) {
      const value = upstream.headers.get(name)
      if (value) res.setHeader(name, value)
    }
    return res.send(Buffer.from(await upstream.arrayBuffer()))
  } catch (error) {
    return res.status(502).json({ detail: `เชื่อมต่อ SIET Space ไม่ได้: ${error?.message || error}` })
  }
}
