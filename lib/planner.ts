import { addDays, differenceInDays, minDate, parseDate, todayInTimeZone } from '@/lib/date';
import { getDb } from '@/lib/db';
import type {
  AreaSummary,
  GoalSummary,
  PlannerData,
  PlannerOccurrence,
  ProjectSummary,
  TaskDefinitionSummary,
  TaskStatus,
} from '@/lib/planner-types';

const DEFAULT_TIMEZONE = 'Asia/Shanghai';

type RecurrenceRow = {
  taskId: string;
  startDate: string;
  durationDays: number | null;
  frequency: 'DAILY' | 'WEEKLY';
  interval: number;
  weekdays: string | null;
  ownEndDate: string | null;
  generatedThroughDate: string | null;
  projectDueDate: string | null;
  goalDueDate: string | null;
};

type ParentBounds = {
  goalStartDate: string;
  goalDueDate: string | null;
  projectStartDate: string | null;
  projectDueDate: string | null;
};

export type CreateTaskInput = {
  title: string;
  description?: string;
  goalId: string;
  projectId?: string | null;
  startDate: string;
  dueDate?: string | null;
  displayUnit?: 'DAY' | 'WEEK';
  recurrence?: 'NONE' | 'DAILY' | 'WEEKLY';
  interval?: number;
  recurrenceEndDate?: string | null;
};

function matchesRule(date: string, rule: RecurrenceRow) {
  const difference = differenceInDays(date, rule.startDate);
  if (difference < 0) return false;
  if (rule.frequency === 'DAILY') return difference % rule.interval === 0;

  const selectedWeekdays = rule.weekdays
    ? (JSON.parse(rule.weekdays) as number[])
    : [parseDate(rule.startDate).getUTCDay()];
  const weekIndex = Math.floor(difference / 7);
  return weekIndex % rule.interval === 0 && selectedWeekdays.includes(parseDate(date).getUTCDay());
}

async function seedDemoData() {
  const db = getDb();
  const existing = await db.prepare('SELECT COUNT(*) AS count FROM areas WHERE deleted_at IS NULL').first<{ count: number }>();
  if (Number(existing?.count ?? 0) > 0) return;

  const today = todayInTimeZone(DEFAULT_TIMEZONE);
  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [];

  const addArea = (id: string, name: string, color: string, sortOrder: number) => {
    statements.push(
      db
        .prepare('INSERT INTO areas (id, name, color, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(id, name, color, sortOrder, now, now),
    );
  };
  const addGoal = (
    id: string,
    areaId: string,
    title: string,
    startDate: string,
    dueDate: string | null,
    sortOrder: number,
  ) => {
    const durationDays = dueDate ? differenceInDays(dueDate, startDate) + 1 : null;
    statements.push(
      db
        .prepare(`
          INSERT INTO goals (
            id, area_id, title, start_date, own_due_date, duration_value,
            duration_days, display_unit, status, sort_order, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'MONTH', 'ACTIVE', ?, ?, ?)
        `)
        .bind(
          id,
          areaId,
          title,
          startDate,
          dueDate,
          durationDays ? Number((durationDays / 30).toFixed(2)) : null,
          durationDays,
          sortOrder,
          now,
          now,
        ),
    );
  };
  const addProject = (
    id: string,
    goalId: string,
    title: string,
    startDate: string,
    dueDate: string | null,
    sortOrder: number,
  ) => {
    const durationDays = dueDate ? differenceInDays(dueDate, startDate) + 1 : null;
    statements.push(
      db
        .prepare(`
          INSERT INTO projects (
            id, goal_id, title, start_date, own_due_date, duration_value,
            duration_days, display_unit, status, sort_order, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'WEEK', 'ACTIVE', ?, ?, ?)
        `)
        .bind(
          id,
          goalId,
          title,
          startDate,
          dueDate,
          durationDays ? Number((durationDays / 7).toFixed(2)) : null,
          durationDays,
          sortOrder,
          now,
          now,
        ),
    );
  };
  const addTask = (task: {
    id: string;
    goalId: string;
    projectId?: string | null;
    title: string;
    startDate: string;
    dueDate?: string | null;
    type?: 'ONE_TIME' | 'RECURRING';
    sortOrder: number;
  }) => {
    const durationDays = task.dueDate ? differenceInDays(task.dueDate, task.startDate) + 1 : task.type === 'RECURRING' ? 1 : null;
    statements.push(
      db
        .prepare(`
          INSERT INTO task_definitions (
            id, goal_id, project_id, type, title, start_date, own_due_date,
            duration_value, duration_days, display_unit, definition_status,
            sort_order, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'DAY', 'ACTIVE', ?, ?, ?)
        `)
        .bind(
          task.id,
          task.goalId,
          task.projectId ?? null,
          task.type ?? 'ONE_TIME',
          task.title,
          task.startDate,
          task.dueDate ?? null,
          durationDays,
          durationDays,
          task.sortOrder,
          now,
          now,
        ),
    );
  };
  const addOccurrence = (taskId: string, scheduledDate: string, dueDate: string | null) => {
    statements.push(
      db
        .prepare(`
          INSERT INTO task_occurrences (
            id, task_id, scheduled_date, due_date, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, 'PENDING', ?, ?)
        `)
        .bind(`occ-${taskId}-${scheduledDate}`, taskId, scheduledDate, dueDate, now, now),
    );
  };
  const addRule = (
    taskId: string,
    frequency: 'DAILY' | 'WEEKLY',
    interval: number,
    startDate: string,
  ) => {
    statements.push(
      db
        .prepare(`
          INSERT INTO recurrence_rules (
            id, task_id, frequency, interval, weekdays, generated_through_date,
            series_status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)
        `)
        .bind(
          `rule-${taskId}`,
          taskId,
          frequency,
          interval,
          frequency === 'WEEKLY' ? JSON.stringify([parseDate(startDate).getUTCDay()]) : null,
          addDays(startDate, -1),
          now,
          now,
        ),
    );
  };

  addArea('area-work', '工作', '#6366f1', 0);
  addArea('area-health', '健康', '#10b981', 1);
  addArea('area-growth', '成长', '#f59e0b', 2);

  addGoal('goal-planner', 'area-work', '完成事项规划系统第一版', addDays(today, -14), addDays(today, 30), 0);
  addGoal('goal-running', 'area-health', '完成半程马拉松', addDays(today, -30), addDays(today, 90), 0);
  addGoal('goal-reading', 'area-growth', '建立稳定阅读习惯', addDays(today, -20), null, 0);

  addProject('project-v1', 'goal-planner', '第一版产品实现', addDays(today, -7), addDays(today, 14), 0);
  addProject('project-training', 'goal-running', '基础训练阶段', addDays(today, -21), addDays(today, 60), 0);

  addTask({ id: 'task-requirements', goalId: 'goal-planner', projectId: 'project-v1', title: '整理第一版产品需求', startDate: addDays(today, -3), dueDate: today, sortOrder: 0 });
  addTask({ id: 'task-data-model', goalId: 'goal-planner', projectId: 'project-v1', title: '完成数据模型草案', startDate: addDays(today, -6), dueDate: addDays(today, -2), sortOrder: 1 });
  addTask({ id: 'task-undated', goalId: 'goal-planner', projectId: 'project-v1', title: '整理后续版本想法', startDate: today, sortOrder: 2 });
  addTask({ id: 'task-upcoming-1', goalId: 'goal-planner', projectId: 'project-v1', title: '完成移动端导航交互', startDate: addDays(today, 2), dueDate: addDays(today, 3), sortOrder: 3 });
  addTask({ id: 'task-upcoming-2', goalId: 'goal-planner', projectId: 'project-v1', title: '验证循环任务边界', startDate: addDays(today, 5), dueDate: addDays(today, 7), sortOrder: 4 });
  addTask({ id: 'task-upcoming-3', goalId: 'goal-planner', projectId: 'project-v1', title: '整理第一轮体验反馈', startDate: addDays(today, 11), dueDate: addDays(today, 12), sortOrder: 5 });
  addTask({ id: 'task-strength', goalId: 'goal-running', projectId: 'project-training', title: '完成 30 分钟力量训练', startDate: addDays(today, -7), type: 'RECURRING', sortOrder: 0 });
  addTask({ id: 'task-reading', goalId: 'goal-reading', title: '阅读并记录今日笔记', startDate: today, type: 'RECURRING', sortOrder: 0 });

  addOccurrence('task-requirements', addDays(today, -3), today);
  addOccurrence('task-data-model', addDays(today, -6), addDays(today, -2));
  addOccurrence('task-undated', today, null);
  addOccurrence('task-upcoming-1', addDays(today, 2), addDays(today, 3));
  addOccurrence('task-upcoming-2', addDays(today, 5), addDays(today, 7));
  addOccurrence('task-upcoming-3', addDays(today, 11), addDays(today, 12));

  addRule('task-strength', 'DAILY', 7, addDays(today, -7));
  addRule('task-reading', 'DAILY', 3, today);

  statements.push(
    db
      .prepare(`
        INSERT INTO user_preferences (id, timezone, upcoming_days, created_at, updated_at)
        VALUES ('default', ?, 14, ?, ?)
      `)
      .bind(DEFAULT_TIMEZONE, now, now),
  );

  await db.batch(statements);
}

async function generateRecurringOccurrences(horizon: string) {
  const db = getDb();
  const { results } = await db.prepare(`
    SELECT
      td.id AS taskId,
      td.start_date AS startDate,
      td.duration_days AS durationDays,
      rr.frequency AS frequency,
      rr.interval AS interval,
      rr.weekdays AS weekdays,
      rr.own_end_date AS ownEndDate,
      rr.generated_through_date AS generatedThroughDate,
      p.own_due_date AS projectDueDate,
      g.own_due_date AS goalDueDate
    FROM task_definitions td
    JOIN recurrence_rules rr ON rr.task_id = td.id
    JOIN goals g ON g.id = td.goal_id
    LEFT JOIN projects p ON p.id = td.project_id
    WHERE td.type = 'RECURRING'
      AND td.definition_status = 'ACTIVE'
      AND td.deleted_at IS NULL
      AND rr.series_status = 'ACTIVE'
  `).all<RecurrenceRow>();

  for (const rule of results) {
    const effectiveEnd = minDate(rule.ownEndDate, rule.projectDueDate, rule.goalDueDate);
    const rangeEnd = minDate(horizon, effectiveEnd) ?? horizon;
    let cursor = rule.generatedThroughDate ? addDays(rule.generatedThroughDate, 1) : rule.startDate;
    if (cursor < rule.startDate) cursor = rule.startDate;
    if (cursor > rangeEnd) continue;

    const statements: D1PreparedStatement[] = [];
    for (let date = cursor; date <= rangeEnd; date = addDays(date, 1)) {
      if (!matchesRule(date, rule)) continue;
      const dueDate = addDays(date, Math.max(rule.durationDays ?? 1, 1) - 1);
      if (effectiveEnd && dueDate > effectiveEnd) continue;
      const now = new Date().toISOString();
      statements.push(
        db
          .prepare(`
            INSERT OR IGNORE INTO task_occurrences (
              id, task_id, scheduled_date, due_date, status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, 'PENDING', ?, ?)
          `)
          .bind(`occ-${rule.taskId}-${date}`, rule.taskId, date, dueDate, now, now),
      );
    }

    statements.push(
      db
        .prepare('UPDATE recurrence_rules SET generated_through_date = ?, updated_at = ? WHERE task_id = ?')
        .bind(rangeEnd, new Date().toISOString(), rule.taskId),
    );

    for (let offset = 0; offset < statements.length; offset += 75) {
      await db.batch(statements.slice(offset, offset + 75));
    }
  }
}

export async function getPlannerData(upcomingDays = 14): Promise<PlannerData> {
  const db = getDb();
  await seedDemoData();

  const preference = await db.prepare("SELECT timezone, upcoming_days AS upcomingDays FROM user_preferences WHERE id = 'default'").first<{ timezone: string; upcomingDays: number }>();
  const timeZone = preference?.timezone ?? DEFAULT_TIMEZONE;
  const today = todayInTimeZone(timeZone);
  const normalizedRange = Math.min(Math.max(upcomingDays || preference?.upcomingDays || 14, 1), 90);
  await generateRecurringOccurrences(addDays(today, normalizedRange));

  const [areaResult, goalResult, projectResult, definitionResult, occurrenceResult] = await Promise.all([
    db.prepare(`
      SELECT a.id, a.name, a.color, COUNT(DISTINCT td.id) AS taskCount
      FROM areas a
      LEFT JOIN goals g ON g.area_id = a.id AND g.deleted_at IS NULL
      LEFT JOIN task_definitions td ON td.goal_id = g.id AND td.deleted_at IS NULL
      WHERE a.deleted_at IS NULL AND a.archived_at IS NULL
      GROUP BY a.id, a.name, a.color, a.sort_order
      ORDER BY a.sort_order, a.created_at
    `).all<AreaSummary>(),
    db.prepare(`
      SELECT id, area_id AS areaId, title, start_date AS startDate,
        own_due_date AS ownDueDate, status
      FROM goals
      WHERE deleted_at IS NULL
      ORDER BY sort_order, created_at
    `).all<GoalSummary>(),
    db.prepare(`
      SELECT id, goal_id AS goalId, title, start_date AS startDate,
        own_due_date AS ownDueDate, status
      FROM projects
      WHERE deleted_at IS NULL
      ORDER BY sort_order, created_at
    `).all<ProjectSummary>(),
    db.prepare(`
      SELECT
        td.id,
        td.goal_id AS goalId,
        td.project_id AS projectId,
        td.title,
        td.type,
        td.start_date AS startDate,
        td.own_due_date AS ownDueDate,
        td.duration_value AS durationValue,
        td.duration_days AS durationDays,
        td.display_unit AS displayUnit,
        td.definition_status AS definitionStatus,
        COALESCE(SUM(CASE WHEN o.status = 'PENDING' THEN 1 ELSE 0 END), 0) AS pendingCount,
        COALESCE(SUM(CASE WHEN o.status = 'COMPLETED' THEN 1 ELSE 0 END), 0) AS completedCount,
        COALESCE(SUM(CASE WHEN o.status = 'CANCELLED' THEN 1 ELSE 0 END), 0) AS cancelledCount,
        rr.frequency AS frequency,
        rr.interval AS interval,
        rr.own_end_date AS ownEndDate
      FROM task_definitions td
      LEFT JOIN task_occurrences o ON o.task_id = td.id
      LEFT JOIN recurrence_rules rr ON rr.task_id = td.id
      WHERE td.deleted_at IS NULL
      GROUP BY td.id
      ORDER BY td.sort_order, td.created_at
    `).all<TaskDefinitionSummary>(),
    db.prepare(`
      SELECT
        o.id,
        o.task_id AS taskId,
        td.title,
        td.description,
        td.type,
        o.scheduled_date AS scheduledDate,
        o.due_date AS dueDate,
        o.status,
        o.completed_at AS completedAt,
        g.id AS goalId,
        g.title AS goalTitle,
        p.id AS projectId,
        p.title AS projectTitle,
        a.id AS areaId,
        a.name AS areaName,
        a.color AS areaColor,
        rr.frequency AS frequency,
        rr.interval AS interval
      FROM task_occurrences o
      JOIN task_definitions td ON td.id = o.task_id
      JOIN goals g ON g.id = td.goal_id
      JOIN areas a ON a.id = g.area_id
      LEFT JOIN projects p ON p.id = td.project_id
      LEFT JOIN recurrence_rules rr ON rr.task_id = td.id
      WHERE td.deleted_at IS NULL
      ORDER BY COALESCE(o.due_date, o.scheduled_date), td.sort_order, o.created_at
    `).all<PlannerOccurrence>(),
  ]);

  return {
    today,
    upcomingDays: normalizedRange,
    areas: areaResult.results,
    goals: goalResult.results,
    projects: projectResult.results,
    taskDefinitions: definitionResult.results,
    occurrences: occurrenceResult.results,
  };
}

async function getParentBounds(goalId: string, projectId?: string | null) {
  const db = getDb();
  const bounds = await db.prepare(`
    SELECT
      g.start_date AS goalStartDate,
      g.own_due_date AS goalDueDate,
      p.start_date AS projectStartDate,
      p.own_due_date AS projectDueDate
    FROM goals g
    LEFT JOIN projects p ON p.id = ? AND p.goal_id = g.id
    WHERE g.id = ? AND g.deleted_at IS NULL
  `).bind(projectId ?? null, goalId).first<ParentBounds>();
  if (!bounds) throw new Error('目标不存在');
  if (projectId && !bounds.projectStartDate) throw new Error('项目不属于所选目标');
  return bounds;
}

export async function createTask(input: CreateTaskInput) {
  const db = getDb();
  const title = input.title.trim();
  if (!title) throw new Error('请输入任务名称');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate)) throw new Error('开始日期无效');

  const bounds = await getParentBounds(input.goalId, input.projectId);
  const earliestStart = [bounds.goalStartDate, bounds.projectStartDate]
    .filter((date): date is string => Boolean(date))
    .sort((left, right) => left.localeCompare(right))
    .at(-1)!;
  const latestEnd = minDate(bounds.goalDueDate, bounds.projectDueDate);
  if (input.startDate < earliestStart) throw new Error(`开始日期不能早于 ${earliestStart}`);

  const recurrence = input.recurrence ?? 'NONE';
  const dueDate = input.dueDate || null;
  const recurrenceEndDate = input.recurrenceEndDate || null;
  if (dueDate && dueDate < input.startDate) throw new Error('截止日期不能早于开始日期');
  if (latestEnd && dueDate && dueDate > latestEnd) throw new Error(`截止日期不能晚于上层边界 ${latestEnd}`);
  if (latestEnd && recurrenceEndDate && recurrenceEndDate > latestEnd) throw new Error(`循环结束日期不能晚于上层边界 ${latestEnd}`);

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const durationDays = recurrence === 'NONE' && dueDate ? differenceInDays(dueDate, input.startDate) + 1 : 1;
  const displayUnit = input.displayUnit ?? 'DAY';
  const durationValue = displayUnit === 'WEEK' ? Number((durationDays / 7).toFixed(2)) : durationDays;

  const statements: D1PreparedStatement[] = [
    db.prepare(`
      INSERT INTO task_definitions (
        id, goal_id, project_id, type, title, description, start_date, own_due_date,
        duration_value, duration_days, display_unit, definition_status,
        sort_order, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', 999, ?, ?)
    `).bind(
      id,
      input.goalId,
      input.projectId ?? null,
      recurrence === 'NONE' ? 'ONE_TIME' : 'RECURRING',
      title,
      input.description?.trim() ?? '',
      input.startDate,
      recurrence === 'NONE' ? dueDate : null,
      dueDate || recurrence !== 'NONE' ? durationValue : null,
      dueDate || recurrence !== 'NONE' ? durationDays : null,
      displayUnit,
      now,
      now,
    ),
  ];

  if (recurrence === 'NONE') {
    statements.push(
      db.prepare(`
        INSERT INTO task_occurrences (
          id, task_id, scheduled_date, due_date, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'PENDING', ?, ?)
      `).bind(crypto.randomUUID(), id, input.startDate, dueDate, now, now),
    );
  } else {
    const interval = Math.max(Math.round(input.interval ?? 1), 1);
    const weekdays = recurrence === 'WEEKLY'
      ? JSON.stringify([parseDate(input.startDate).getUTCDay()])
      : null;
    statements.push(
      db.prepare(`
        INSERT INTO recurrence_rules (
          id, task_id, frequency, interval, weekdays, own_end_date,
          generated_through_date, series_status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)
      `).bind(
        crypto.randomUUID(),
        id,
        recurrence,
        interval,
        weekdays,
        recurrenceEndDate,
        addDays(input.startDate, -1),
        now,
        now,
      ),
    );
  }

  await db.batch(statements);
  return { id };
}

export async function updateOccurrenceStatus(id: string, status: TaskStatus) {
  const db = getDb();
  if (!['PENDING', 'COMPLETED', 'CANCELLED'].includes(status)) throw new Error('任务状态无效');
  const existing = await db.prepare('SELECT id FROM task_occurrences WHERE id = ?').bind(id).first();
  if (!existing) throw new Error('任务不存在');

  const now = new Date().toISOString();
  await db.prepare(`
    UPDATE task_occurrences
    SET status = ?,
      completed_at = ?,
      cancelled_at = ?,
      updated_at = ?
    WHERE id = ?
  `).bind(
    status,
    status === 'COMPLETED' ? now : null,
    status === 'CANCELLED' ? now : null,
    now,
    id,
  ).run();
}
