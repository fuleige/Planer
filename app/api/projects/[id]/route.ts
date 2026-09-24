import { protectApi } from '@/lib/auth';
import { deleteProject, updateProject, type CreateProjectInput } from '@/lib/planner';

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const denied = await protectApi(request, { mutation: true });
  if (denied) return denied;
  try {
    return Response.json(await updateProject((await context.params).id, (await request.json()) as CreateProjectInput));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : '无法修改项目' }, { status: 400 });
  }
}

export async function DELETE(request: Request, context: Context) {
  const denied = await protectApi(request, { mutation: true });
  if (denied) return denied;
  try {
    return Response.json(await deleteProject((await context.params).id));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : '无法删除项目' }, { status: 400 });
  }
}
