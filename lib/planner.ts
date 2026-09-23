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
  durationValue?: number | null;
  displayUnit?: 'DAY' | 'WEEK';
  recurrence?: 'NONE' | 'DAILY' | 'WEEKLY';
  interval?: number;
  recurrenceEndDate?: string | null;
};

export type CreateAreaInput = {
  name: string;
  color?: string;
};

export type CreateGoalInput = {
  areaId: string;
  title: string;
  description?: string;
  startDate: string;
  dueDate?: string | null;
  durationValue?: number | null;
};

export type CreateProjectInput = {
  goalId: string;
  title: string;
  description?: string;
  startDate: string;
  dueDate?: string | null;
  durationValue?: number | null;
  displayUnit?: 'DAY' | 'WEEK';
};

function isDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = parseDate(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function validateDateRange(startDate: string, dueDate?: string | null) {
  if (!isDate(startDate)) throw new Error('开始日期无效');
  if (dueDate && !isDate(dueDate)) throw new Error('截止日期无效');
  if (dueDate && dueDate < startDate) throw new Error('截止日期不能早于开始日期');
}

function normalizedDurationValue(
  provided: number | null | undefined,
  durationDays: number | null,
  unit: 'DAY' | 'WEEK' | 'MONTH',
) {
  if (!durationDays) return null;
  const divisor = unit === 'MONTH' ? 30 : unit === 'WEEK' ? 7 : 1;
  if (
    provided != null
    && Number.isFinite(provided)
    && provided > 0
    && Math.ceil(provided * divisor) === durationDays
  ) {
    return provided;
  }
  return unit === 'DAY' ? durationDays : Number((durationDays / divisor).toFixed(2));
}

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
        o.cancelled_at AS cancelledAt,
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
    timeZone,
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
    LEFT JOIN projects p ON p.id = ? AND p.goal_id = g.id AND p.deleted_at IS NULL AND p.status = 'ACTIVE'
    WHERE g.id = ? AND g.deleted_at IS NULL AND g.status = 'ACTIVE'
  `).bind(projectId ?? null, goalId).first<ParentBounds>();
  if (!bounds) throw new Error('目标不存在');
  if (projectId && !bounds.projectStartDate) throw new Error('项目不属于所选目标');
  return bounds;
}

export async function createArea(input: CreateAreaInput) {
  const db = getDb();
  const name = input.name.trim();
  const color = input.color?.trim() || '#6366f1';
  if (!name) throw new Error('请输入领域名称');
  if (name.length > 60) throw new Error('领域名称不能超过 60 个字符');
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) throw new Error('领域颜色无效');

  const duplicate = await db
    .prepare('SELECT id FROM areas WHERE name = ? AND deleted_at IS NULL')
    .bind(name)
    .first();
  if (duplicate) throw new Error('已经存在同名领域');

  const sortOrder = await db
    .prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS value FROM areas WHERE deleted_at IS NULL')
    .first<{ value: number }>();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.prepare(`
    INSERT INTO areas (id, name, color, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(id, name, color, Number(sortOrder?.value ?? 0), now, now).run();
  return { id };
}

export async function createGoal(input: CreateGoalInput) {
  const db = getDb();
  const title = input.title.trim();
  const dueDate = input.dueDate || null;
  if (!title) throw new Error('请输入目标名称');
  if (title.length > 120) throw new Error('目标名称不能超过 120 个字符');
  validateDateRange(input.startDate, dueDate);

  const area = await db
    .prepare('SELECT id FROM areas WHERE id = ? AND deleted_at IS NULL AND archived_at IS NULL')
    .bind(input.areaId)
    .first();
  if (!area) throw new Error('所属领域不存在');

  const durationDays = dueDate ? differenceInDays(dueDate, input.startDate) + 1 : null;
  const durationValue = normalizedDurationValue(input.durationValue, durationDays, 'MONTH');
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.prepare(`
    INSERT INTO goals (
      id, area_id, title, description, start_date, own_due_date,
      duration_value, duration_days, display_unit, status,
      sort_order, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'MONTH', 'ACTIVE', 999, ?, ?)
  `).bind(
    id,
    input.areaId,
    title,
    input.description?.trim() ?? '',
    input.startDate,
    dueDate,
    durationValue,
    durationDays,
    now,
    now,
  ).run();
  return { id };
}

export async function createProject(input: CreateProjectInput) {
  const db = getDb();
  const title = input.title.trim();
  const dueDate = input.dueDate || null;
  const displayUnit = input.displayUnit === 'WEEK' ? 'WEEK' : 'DAY';
  if (!title) throw new Error('请输入项目名称');
  if (title.length > 120) throw new Error('项目名称不能超过 120 个字符');
  validateDateRange(input.startDate, dueDate);

  const goal = await db.prepare(`
    SELECT start_date AS startDate, own_due_date AS dueDate
    FROM goals
    WHERE id = ? AND deleted_at IS NULL AND status = 'ACTIVE'
  `).bind(input.goalId).first<{ startDate: string; dueDate: string | null }>();
  if (!goal) throw new Error('所属目标不存在或不可用');
  if (input.startDate < goal.startDate) throw new Error(`开始日期不能早于目标开始日期 ${goal.startDate}`);
  if (goal.dueDate && input.startDate > goal.dueDate) throw new Error(`开始日期不能晚于目标边界 ${goal.dueDate}`);
  if (goal.dueDate && dueDate && dueDate > goal.dueDate) throw new Error(`截止日期不能晚于目标边界 ${goal.dueDate}`);

  const durationDays = dueDate ? differenceInDays(dueDate, input.startDate) + 1 : null;
  const durationValue = normalizedDurationValue(input.durationValue, durationDays, displayUnit);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.prepare(`
    INSERT INTO projects (
      id, goal_id, title, description, start_date, own_due_date,
      duration_value, duration_days, display_unit, status,
      sort_order, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', 999, ?, ?)
  `).bind(
    id,
    input.goalId,
    title,
    input.description?.trim() ?? '',
    input.startDate,
    dueDate,
    durationValue,
    durationDays,
    displayUnit,
    now,
    now,
  ).run();
  return { id };
}

export async function createTask(input: CreateTaskInput) {
  const db = getDb();
  const title = input.title.trim();
  if (!title) throw new Error('请输入任务名称');
  if (title.length > 120) throw new Error('任务名称不能超过 120 个字符');
  if (!isDate(input.startDate)) throw new Error('开始日期无效');

  const bounds = await getParentBounds(input.goalId, input.projectId);
  const earliestStart = [bounds.goalStartDate, bounds.projectStartDate]
    .filter((date): date is string => Boolean(date))
    .sort((left, right) => left.localeCompare(right))
    .at(-1)!;
  const latestEnd = minDate(bounds.goalDueDate, bounds.projectDueDate);
  if (input.startDate < earliestStart) throw new Error(`开始日期不能早于 ${earliestStart}`);
  if (latestEnd && input.startDate > latestEnd) throw new Error(`开始日期不能晚于上层边界 ${latestEnd}`);

  const recurrence = input.recurrence ?? 'NONE';
  const dueDate = input.dueDate || null;
  const recurrenceEndDate = input.recurrenceEndDate || null;
  if (!['NONE', 'DAILY', 'WEEKLY'].includes(recurrence)) throw new Error('循环方式无效');
  if (dueDate && !isDate(dueDate)) throw new Error('截止日期无效');
  if (recurrenceEndDate && !isDate(recurrenceEndDate)) throw new Error('循环结束日期无效');
  if (dueDate && dueDate < input.startDate) throw new Error('截止日期不能早于开始日期');
  if (recurrenceEndDate && recurrenceEndDate < input.startDate) throw new Error('循环结束日期不能早于开始日期');
  if (latestEnd && dueDate && dueDate > latestEnd) throw new Error(`截止日期不能晚于上层边界 ${latestEnd}`);
  if (latestEnd && recurrenceEndDate && recurrenceEndDate > latestEnd) throw new Error(`循环结束日期不能晚于上层边界 ${latestEnd}`);

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const displayUnit = input.displayUnit === 'WEEK' ? 'WEEK' : 'DAY';
  const providedDuration = input.durationValue ?? null;
  if (providedDuration != null && (!Number.isFinite(providedDuration) || providedDuration <= 0)) {
    throw new Error('预计时长必须大于 0');
  }
  if (displayUnit === 'DAY' && providedDuration != null && !Number.isInteger(providedDuration)) {
    throw new Error('按日设置时，预计时长必须是整数');
  }
  const durationDays = recurrence === 'NONE'
    ? dueDate ? differenceInDays(dueDate, input.startDate) + 1 : null
    : providedDuration ? Math.ceil(providedDuration * (displayUnit === 'WEEK' ? 7 : 1)) : 1;
  const durationValue = normalizedDurationValue(providedDuration, durationDays, displayUnit);

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
      durationValue,
      durationDays,
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
    const rawInterval = input.interval ?? 1;
    if (!Number.isInteger(rawInterval) || rawInterval < 1 || rawInterval > 99) throw new Error('循环间隔必须是 1 到 99 的整数');
    const interval = rawInterval;
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
