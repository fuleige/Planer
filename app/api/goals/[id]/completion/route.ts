import { protectApi } from '@/lib/auth';
import { setGoalCompletion } from '@/lib/planner';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = await protectApi(request, { mutation: true });
  if (denied) return denied;
  try {
    const body = (await request.json()) as { completed?: boolean };
    if (typeof body.completed !== 'boolean') throw new Error('目标状态无效');
    return Response.json(await setGoalCompletion((await context.params).id, body.completed));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : '无法更新目标状态' }, { status: 400 });
  }
}
