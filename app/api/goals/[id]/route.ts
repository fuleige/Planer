import { protectApi } from '@/lib/auth';
import { deleteGoal, updateGoal, type CreateGoalInput } from '@/lib/planner';

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const denied = await protectApi(request, { mutation: true });
  if (denied) return denied;
  try {
    return Response.json(await updateGoal((await context.params).id, (await request.json()) as CreateGoalInput));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : '无法修改目标' }, { status: 400 });
  }
}

export async function DELETE(request: Request, context: Context) {
  const denied = await protectApi(request, { mutation: true });
  if (denied) return denied;
  try {
    return Response.json(await deleteGoal((await context.params).id));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : '无法删除目标' }, { status: 400 });
  }
}
