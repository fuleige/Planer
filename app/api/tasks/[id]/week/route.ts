import { protectApi } from '@/lib/auth';
import { setWeeklyCycleComplete } from '@/lib/planner';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = await protectApi(request, { mutation: true });
  if (denied) return denied;
  try {
    const body = (await request.json()) as { completed: boolean };
    return Response.json(await setWeeklyCycleComplete((await context.params).id, body.completed === true));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : '无法更新本周循环' }, { status: 400 });
  }
}
