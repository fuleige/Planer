import { protectApi } from '@/lib/auth';
import { rescheduleOverdueTask } from '@/lib/planner';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = await protectApi(request, { mutation: true });
  if (denied) return denied;
  try {
    const { dueDate } = (await request.json()) as { dueDate: string };
    return Response.json(await rescheduleOverdueTask((await context.params).id, dueDate));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : '无法重设截止日期' }, { status: 400 });
  }
}
