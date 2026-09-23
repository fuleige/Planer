import { protectApi } from '@/lib/auth';
import { createProject, type CreateProjectInput } from '@/lib/planner';

export async function POST(request: Request) {
  const denied = await protectApi(request, { mutation: true });
  if (denied) return denied;

  try {
    const input = (await request.json()) as CreateProjectInput;
    return Response.json(await createProject(input), { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : '无法创建项目';
    return Response.json({ error: message }, { status: 400 });
  }
}
