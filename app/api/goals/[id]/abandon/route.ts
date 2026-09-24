import { protectApi } from '@/lib/auth';
import { setGoalAbandoned } from '@/lib/planner';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = await protectApi(request, { mutation: true });
  if (denied) return denied;
  try {
    const body = (await request.json()) as { abandoned?: boolean };
    if (typeof body.abandoned !== 'boolean') throw new Error('目标状态无效');
    return Response.json(await setGoalAbandoned((await context.params).id, body.abandoned));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : '无法更新目标状态' }, { status: 400 });
  }
}
