import { clearSessionCookies, isSameOrigin } from '@/lib/auth';

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return Response.json({ error: '请求来源无效' }, { status: 403 });
  }

  const headers = new Headers();
  for (const cookie of clearSessionCookies()) headers.append('set-cookie', cookie);
  return Response.json({ ok: true }, { headers });
}
