/**
 * Server-side bridge: POST /quiz/api/share-quiz
 * Body: { session_id: string, content?: string, title?: string }
 * Creates a SIET Space community post that embeds the generated quiz.
 */
export async function POST(req: Request) {
  const workspaceApiUrl = process.env.OPEN_NOTEBOOK_API_URL;
  const authorization = req.headers.get('authorization');
  if (!workspaceApiUrl || !authorization) {
    return Response.json({ error: 'Not signed in to the workspace' }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const sessionId = typeof body?.session_id === 'string' ? body.session_id : '';
  if (!sessionId) {
    return Response.json({ error: 'session_id is required' }, { status: 400 });
  }
  const form = new FormData();
  form.append('type', 'quiz');
  form.append('embed_type', 'quiz');
  form.append('embed_id', sessionId);
  if (typeof body?.title === 'string' && body.title) form.append('title', body.title);
  if (typeof body?.content === 'string' && body.content) form.append('content', body.content);
  try {
    const res = await fetch(`${workspaceApiUrl.replace(/\/$/, '')}/api/community/posts`, {
      method: 'POST',
      headers: { Authorization: authorization },
      body: form,
    });
    const data = await res.json();
    if (!res.ok) {
      return Response.json({ error: data?.detail || 'Share failed' }, { status: res.status });
    }
    return Response.json({ post_id: data?.post?.id ?? null });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Workspace unavailable' }, { status: 502 });
  }
}
