import { protectApi } from '@/lib/auth';
import { deleteArea, updateArea, type CreateAreaInput } from '@/lib/planner';

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const denied = await protectApi(request, { mutation: true });
  if (denied) return denied;
  try {
    return Response.json(await updateArea((await context.params).id, (await request.json()) as CreateAreaInput));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : '无法修改领域' }, { status: 400 });
  }
}

export async function DELETE(request: Request, context: Context) {
  const denied = await protectApi(request, { mutation: true });
  if (denied) return denied;
  try {
    return Response.json(await deleteArea((await context.params).id));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : '无法删除领域' }, { status: 400 });
  }
}
