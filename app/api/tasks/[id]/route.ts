import { protectApi } from '@/lib/auth';
import { deleteTask, updateTask, type CreateTaskInput } from '@/lib/planner';

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const denied = await protectApi(request, { mutation: true });
  if (denied) return denied;
  try {
    return Response.json(await updateTask((await context.params).id, (await request.json()) as CreateTaskInput));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : '无法修改任务' }, { status: 400 });
  }
}

export async function DELETE(request: Request, context: Context) {
  const denied = await protectApi(request, { mutation: true });
  if (denied) return denied;
  try {
    return Response.json(await deleteTask((await context.params).id));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : '无法删除任务' }, { status: 400 });
  }
}
