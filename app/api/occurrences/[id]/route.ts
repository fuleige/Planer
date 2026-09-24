import { protectApi } from '@/lib/auth';
import { clearOverdueOccurrence, updateOccurrenceStatus } from '@/lib/planner';
import type { TaskStatus } from '@/lib/planner-types';

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const denied = await protectApi(request, { mutation: true });
  if (denied) return denied;

  try {
    const { id } = await context.params;
    const body = (await request.json()) as { status: TaskStatus };
    await updateOccurrenceStatus(id, body.status);
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : '无法更新任务';
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = await protectApi(request, { mutation: true });
  if (denied) return denied;
  try {
    return Response.json(await clearOverdueOccurrence((await context.params).id));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : '无法清理逾期记录' }, { status: 400 });
  }
}
