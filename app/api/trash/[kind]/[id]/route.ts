import { protectApi } from '@/lib/auth';
import { restoreDeletedItem, type DeletedItem } from '@/lib/planner';

export async function POST(request: Request, context: { params: Promise<{ kind: string; id: string }> }) {
  const denied = await protectApi(request, { mutation: true });
  if (denied) return denied;
  try {
    const { kind, id } = await context.params;
    if (!['AREA', 'GOAL', 'PROJECT', 'TASK'].includes(kind)) throw new Error('事项类型无效');
    return Response.json(await restoreDeletedItem(kind as DeletedItem['kind'], id));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : '无法恢复事项' }, { status: 400 });
  }
}
