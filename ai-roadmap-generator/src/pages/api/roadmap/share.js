/**
 * POST /api/roadmap/share  { session_id, title?, content? }
 * Server-side bridge that creates a SIET Space community post embedding the
 * Open Notebook roadmap session (the browser never talks to the API container).
 */
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, message: "method not allowed" });
  }
  const workspaceApiUrl = process.env.OPEN_NOTEBOOK_API_URL;
  const authorization = req.headers["authorization"];
  if (!workspaceApiUrl || !authorization) {
    return res.status(401).json({ ok: false, message: "Not signed in to the workspace" });
  }
  const { session_id: sessionId, title, content } = req.body || {};
  if (!sessionId) {
    return res.status(400).json({ ok: false, message: "session_id is required" });
  }
  const form = new FormData();
  form.append("type", "roadmap");
  form.append("embed_type", "roadmap");
  form.append("embed_id", String(sessionId));
  if (title) form.append("title", String(title));
  if (content) form.append("content", String(content));
  try {
    const upstream = await fetch(`${workspaceApiUrl.replace(/\/$/, "")}/api/community/posts`, {
      method: "POST",
      headers: { Authorization: authorization },
      body: form,
    });
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      return res.status(upstream.status).json({ ok: false, message: data?.detail || "Share failed" });
    }
    return res.status(200).json({ ok: true, post_id: data?.post?.id ?? null });
  } catch (error) {
    return res.status(502).json({ ok: false, message: `Workspace unavailable: ${error?.message || error}` });
  }
}
