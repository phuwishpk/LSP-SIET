/**
 * Server-side bridge: GET /quiz/api/me → Open Notebook /api/users/me
 * (returns the workspace user incl. points balance).
 */
export async function GET(req: Request) {
  const workspaceApiUrl = process.env.OPEN_NOTEBOOK_API_URL;
  const authorization = req.headers.get('authorization');
  if (!workspaceApiUrl || !authorization) {
    return Response.json({ error: 'Not signed in to the workspace' }, { status: 401 });
  }
  try {
    const res = await fetch(`${workspaceApiUrl.replace(/\/$/, '')}/api/users/me`, {
      headers: { Authorization: authorization },
      cache: 'no-store',
    });
    const data = await res.json();
    return Response.json(data, { status: res.status });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Workspace unavailable' }, { status: 502 });
  }
}
