import { protectApi } from '@/lib/auth';
import { setRecurringTaskRunning } from '@/lib/planner';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = await protectApi(request, { mutation: true });
  if (denied) return denied;
  try {
    const body = (await request.json()) as { running?: boolean };
    if (typeof body.running !== 'boolean') throw new Error('循环状态无效');
    return Response.json(await setRecurringTaskRunning((await context.params).id, body.running));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : '无法修改循环状态' }, { status: 400 });
  }
}
