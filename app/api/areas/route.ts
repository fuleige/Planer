import { protectApi } from '@/lib/auth';
import { createArea, type CreateAreaInput } from '@/lib/planner';

export async function POST(request: Request) {
  const denied = await protectApi(request, { mutation: true });
  if (denied) return denied;

  try {
    const input = (await request.json()) as CreateAreaInput;
    return Response.json(await createArea(input), { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : '无法创建领域';
    return Response.json({ error: message }, { status: 400 });
  }
}
