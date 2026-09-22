import { createTask, type CreateTaskInput } from '@/lib/planner';

export async function POST(request: Request) {
  try {
    const input = (await request.json()) as CreateTaskInput;
    return Response.json(await createTask(input), { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : '无法创建任务';
    return Response.json({ error: message }, { status: 400 });
  }
}
