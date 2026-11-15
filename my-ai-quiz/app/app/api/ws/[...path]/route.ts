/**
 * Server-side relay to the SIET Space API (Open Notebook).
 *
 * The browser calls `/quiz/api/ws/<path>`; this forwards it to
 * `${OPEN_NOTEBOOK_API_URL}/api/<path>` with the caller's Authorization header.
 * The API does all the authentication and permission checks - this only keeps
 * the browser from needing the API's address (which differs per deployment).
 * Same rules as the AI Roadmap app's relay.
 */

// Only what this app uses.
const ALLOWED = [/^community\//, /^users\/me$/];
const REQUEST_HEADERS = ['authorization', 'content-type', 'accept'];
const RESPONSE_HEADERS = ['content-type', 'retry-after', 'x-points-required', 'x-points-balance', 'x-points-kind'];

async function relay(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const base = process.env.OPEN_NOTEBOOK_API_URL;
  if (!base) {
    return Response.json({ detail: 'OPEN_NOTEBOOK_API_URL is not set for the quiz app' }, { status: 500 });
  }
  const segments = (await params).path || [];
  const path = segments.join('/');
  if (!ALLOWED.some((rule) => rule.test(path))) {
    return Response.json({ detail: 'Not found' }, { status: 404 });
  }

  const search = new URL(req.url).search;
  const target = `${base.replace(/\/$/, '')}/api/${segments.map(encodeURIComponent).join('/')}${search}`;
  const headers: Record<string, string> = {};
  for (const name of REQUEST_HEADERS) {
    const value = req.headers.get(name);
    if (value) headers[name] = value;
  }
  const hasBody = !['GET', 'HEAD'].includes(req.method);

  try {
    const upstream = await fetch(target, {
      method: req.method,
      headers,
      body: hasBody ? await req.arrayBuffer() : undefined,
      cache: 'no-store',
    });
    const out = new Headers();
    for (const name of RESPONSE_HEADERS) {
      const value = upstream.headers.get(name);
      if (value) out.set(name, value);
    }
    return new Response(await upstream.arrayBuffer(), { status: upstream.status, headers: out });
  } catch (error) {
    return Response.json(
      { detail: `เชื่อมต่อ SIET Space ไม่ได้: ${error instanceof Error ? error.message : String(error)}` },
      { status: 502 }
    );
  }
}

export const GET = relay;
export const POST = relay;
export const PATCH = relay;
export const DELETE = relay;
