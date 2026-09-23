import { protectApi } from '@/lib/auth';
import { createGoal, type CreateGoalInput } from '@/lib/planner';

export async function POST(request: Request) {
  const denied = await protectApi(request, { mutation: true });
  if (denied) return denied;

  try {
    const input = (await request.json()) as CreateGoalInput;
    return Response.json(await createGoal(input), { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : '无法创建目标';
    return Response.json({ error: message }, { status: 400 });
  }
}
