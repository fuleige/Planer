import {
  createSessionCookie,
  createSessionValue,
  getAuthStatus,
  isSameOrigin,
  validateAccessToken,
} from '@/lib/auth';

export async function POST(request: Request) {
  const auth = await getAuthStatus(request.headers.get('cookie'));
  if (!auth.configured) {
    return Response.json({ error: '访问控制尚未配置' }, { status: 503 });
  }
  if (!isSameOrigin(request)) {
    return Response.json({ error: '请求来源无效' }, { status: 403 });
  }

  try {
    const contentLength = Number(request.headers.get('content-length') ?? 0);
    if (contentLength > 2048) {
      return Response.json({ error: '访问 Token 无效' }, { status: 401 });
    }

    const body = (await request.json()) as { token?: unknown };
    const token = typeof body.token === 'string' ? body.token : '';
    if (!(await validateAccessToken(token))) {
      return Response.json({ error: '访问 Token 无效' }, { status: 401 });
    }

    const session = await createSessionValue();
    return Response.json(
      { ok: true },
      { headers: { 'set-cookie': createSessionCookie(session, request.url) } },
    );
  } catch {
    return Response.json({ error: '登录请求无效' }, { status: 400 });
  }
}
