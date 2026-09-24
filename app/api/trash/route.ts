import { protectApi } from '@/lib/auth';
import { listDeletedItems } from '@/lib/planner';

export async function GET(request: Request) {
  const denied = await protectApi(request);
  if (denied) return denied;
  try {
    return Response.json({ items: await listDeletedItems() });
  } catch {
    return Response.json({ error: '无法读取回收站' }, { status: 500 });
  }
}
