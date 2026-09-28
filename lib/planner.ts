import { addDays, differenceInDays, minDate, parseDate, todayInTimeZone, weekStart } from '@/lib/date';
import { DEFAULT_AREA_COLOR } from '@/lib/area-colors';
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
const RECURRING_OVERDUE_LIMIT = 16;

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
  areaDueDate: string | null;
};

type ParentBounds = {
  areaStartDate: string;
  areaDueDate: string | null;
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
  startDate?: string;
  dueDate?: string | null;
  confirmUnboundedRecurrence?: boolean;
};

export type CreateGoalInput = {
  areaId: string;
  title: string;
  description?: string;
  startDate: string;
  dueDate?: string | null;
  durationValue?: number | null;
  confirmUnboundedRecurrence?: boolean;
};

export type CreateProjectInput = {
  goalId: string;
  title: string;
  description?: string;
  startDate: string;
  dueDate?: string | null;
  durationValue?: number | null;
  displayUnit?: 'DAY' | 'WEEK';
  confirmUnboundedRecurrence?: boolean;
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

  const weekIndex = differenceInDays(weekStart(date), weekStart(rule.startDate)) / 7;
  return weekIndex % rule.interval === 0;
}

async function generateRecurringOccurrences(horizon: string) {
  const db = getDb();
  const completedWeeks = await db.prepare('SELECT task_id AS taskId, week_start AS weekStart FROM recurrence_week_completions')
    .all<{ taskId: string; weekStart: string }>();
  const completedWeekKeys = new Set(completedWeeks.results.map((item) => `${item.taskId}:${item.weekStart}`));
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
      g.own_due_date AS goalDueDate,
      a.own_due_date AS areaDueDate
    FROM task_definitions td
    JOIN recurrence_rules rr ON rr.task_id = td.id
    JOIN goals g ON g.id = td.goal_id
    JOIN areas a ON a.id = g.area_id
    LEFT JOIN projects p ON p.id = td.project_id
    WHERE td.type = 'RECURRING'
      AND td.definition_status = 'ACTIVE'
      AND td.deleted_at IS NULL
      AND rr.series_status = 'ACTIVE'
  `).all<RecurrenceRow>();

  for (const rule of results) {
    const effectiveEnd = minDate(rule.ownEndDate, rule.projectDueDate, rule.goalDueDate, rule.areaDueDate);
    const rangeEnd = minDate(horizon, effectiveEnd) ?? horizon;
    let cursor = rule.generatedThroughDate ? addDays(rule.generatedThroughDate, 1) : rule.startDate;
    if (cursor < rule.startDate) cursor = rule.startDate;
    if (cursor > rangeEnd) continue;

    const statements: D1PreparedStatement[] = [];
    for (let date = cursor; date <= rangeEnd; date = addDays(date, 1)) {
      if (!matchesRule(date, rule)) continue;
      if (rule.frequency === 'WEEKLY' && completedWeekKeys.has(`${rule.taskId}:${weekStart(date)}`)) continue;
      const dueDate = rule.frequency === 'WEEKLY' ? date : addDays(date, Math.max(rule.durationDays ?? 1, 1) - 1);
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

async function capRecurringOverdue(today: string) {
  const db = getDb();
  const tasks = await db.prepare(`SELECT rr.task_id AS taskId FROM recurrence_rules rr
    JOIN task_definitions td ON td.id = rr.task_id WHERE td.deleted_at IS NULL`).all<{ taskId: string }>();
  for (const { taskId } of tasks.results) {
    const count = await db.prepare(`
      SELECT COUNT(*) AS count FROM task_occurrences
      WHERE task_id = ? AND status = 'PENDING' AND due_date < ?
    `).bind(taskId, today).first<{ count: number }>();
    const excess = Number(count?.count ?? 0) - RECURRING_OVERDUE_LIMIT;
    if (excess <= 0) continue;
    const now = new Date().toISOString();
    await db.batch([
      db.prepare(`DELETE FROM task_occurrences WHERE id IN (
        SELECT id FROM task_occurrences
        WHERE task_id = ? AND status = 'PENDING' AND due_date < ?
        ORDER BY due_date, scheduled_date LIMIT ?
      )`).bind(taskId, today, excess),
      db.prepare('UPDATE recurrence_rules SET auto_deleted_overdue_count = auto_deleted_overdue_count + ?, updated_at = ? WHERE task_id = ?')
        .bind(excess, now, taskId),
    ]);
  }
}

export async function getPlannerData(upcomingDays = 14): Promise<PlannerData> {
  const db = getDb();

  const preference = await db.prepare("SELECT timezone, upcoming_days AS upcomingDays FROM user_preferences WHERE id = 'default'").first<{ timezone: string; upcomingDays: number }>();
  const timeZone = preference?.timezone ?? DEFAULT_TIMEZONE;
  const today = todayInTimeZone(timeZone);
  const normalizedRange = Math.min(Math.max(upcomingDays || preference?.upcomingDays || 14, 1), 90);
  await generateRecurringOccurrences(today);
  await capRecurringOverdue(today);

  const [areaResult, goalResult, projectResult, definitionResult, occurrenceResult] = await Promise.all([
    db.prepare(`
      SELECT a.id, a.name, a.color, COALESCE(a.start_date, ?) AS startDate,
        a.own_due_date AS ownDueDate, COUNT(DISTINCT td.id) AS taskCount
      FROM areas a
      LEFT JOIN goals g ON g.area_id = a.id AND g.deleted_at IS NULL
      LEFT JOIN task_definitions td ON td.goal_id = g.id AND td.deleted_at IS NULL
      WHERE a.deleted_at IS NULL AND a.archived_at IS NULL
      GROUP BY a.id, a.name, a.color, a.start_date, a.own_due_date, a.sort_order
      ORDER BY a.sort_order, a.created_at
    `).bind(today).all<AreaSummary>(),
    db.prepare(`
      SELECT id, area_id AS areaId, title, description, start_date AS startDate,
        own_due_date AS ownDueDate, duration_value AS durationValue, status,
        completed_at AS completedAt, abandoned_at AS abandonedAt
      FROM goals
      WHERE deleted_at IS NULL
      ORDER BY sort_order, created_at
    `).all<GoalSummary>(),
    db.prepare(`
      SELECT id, goal_id AS goalId, title, description, start_date AS startDate,
        own_due_date AS ownDueDate, duration_value AS durationValue,
        display_unit AS displayUnit, status,
        completed_at AS completedAt, abandoned_at AS abandonedAt
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
        td.description,
        td.type,
        td.start_date AS startDate,
        td.own_due_date AS ownDueDate,
        td.duration_value AS durationValue,
        td.duration_days AS durationDays,
        td.display_unit AS displayUnit,
        td.definition_status AS definitionStatus,
        COALESCE(SUM(CASE WHEN o.status = 'PENDING' THEN 1 ELSE 0 END), 0) AS pendingCount,
        COALESCE(SUM(CASE WHEN o.status = 'COMPLETED' THEN 1 ELSE 0 END), 0) AS completedCount,
        (SELECT COUNT(*) FROM recurrence_week_completions wc WHERE wc.task_id = td.id) AS completedWeekCount,
        COALESCE(SUM(CASE WHEN o.status = 'CANCELLED' THEN 1 ELSE 0 END), 0) AS cancelledCount,
        MAX(COALESCE(o.completed_at, o.cancelled_at)) AS lastHandledAt,
        rr.frequency AS frequency,
        rr.interval AS interval,
        rr.own_end_date AS ownEndDate,
        COALESCE(rr.auto_deleted_overdue_count, 0) AS autoDeletedOverdueCount,
        EXISTS(SELECT 1 FROM recurrence_week_completions wc WHERE wc.task_id = td.id AND wc.week_start = ?) AS currentWeekCompleted
      FROM task_definitions td
      LEFT JOIN task_occurrences o ON o.task_id = td.id
      LEFT JOIN recurrence_rules rr ON rr.task_id = td.id
      WHERE td.deleted_at IS NULL
      GROUP BY td.id
      ORDER BY td.sort_order, td.created_at
    `).bind(weekStart(today)).all<TaskDefinitionSummary>(),
    db.prepare(`
      SELECT
        o.id,
        o.task_id AS taskId,
        td.title,
        td.description,
        td.start_date AS taskStartDate,
        td.own_due_date AS taskOwnDueDate,
        rr.own_end_date AS recurrenceEndDate,
        a.own_due_date AS areaDueDate,
        g.own_due_date AS goalDueDate,
        p.own_due_date AS projectDueDate,
        td.type,
        td.definition_status AS definitionStatus,
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

  const data: PlannerData = {
    today,
    timeZone,
    upcomingDays: normalizedRange,
    areas: areaResult.results,
    goals: goalResult.results.map((goal) => ({ ...goal, canComplete: false })),
    projects: projectResult.results.map((project) => ({ ...project, canComplete: false })),
    taskDefinitions: definitionResult.results,
    occurrences: occurrenceResult.results,
  };
  data.projects = data.projects.map((project) => ({ ...project, canComplete: canCompleteProject(data, project.id) }));
  data.goals = data.goals.map((goal) => ({ ...goal, canComplete: canCompleteGoal(data, goal.id) }));
  return data;
}

function hasFutureInstances(data: PlannerData, task: TaskDefinitionSummary) {
  if (task.type !== 'RECURRING' || task.definitionStatus !== 'ACTIVE') return false;
  const project = data.projects.find((item) => item.id === task.projectId);
  const goal = data.goals.find((item) => item.id === task.goalId);
  const area = data.areas.find((item) => item.id === goal?.areaId);
  const end = minDate(task.ownEndDate, project?.ownDueDate, goal?.ownDueDate, area?.ownDueDate);
  return !end || end > data.today;
}

function tasksReady(data: PlannerData, tasks: TaskDefinitionSummary[]) {
  return tasks.every((task) => task.pendingCount === 0 && !hasFutureInstances(data, task));
}

function canCompleteProject(data: PlannerData, id: string) {
  const project = data.projects.find((item) => item.id === id);
  if (!project || project.status !== 'ACTIVE') return false;
  const tasks = data.taskDefinitions.filter((task) => task.projectId === id);
  return tasksReady(data, tasks) && tasks.some((task) => task.completedCount + task.completedWeekCount > 0);
}

function canCompleteGoal(data: PlannerData, id: string) {
  const goal = data.goals.find((item) => item.id === id);
  if (!goal || goal.status !== 'ACTIVE') return false;
  const projects = data.projects.filter((project) => project.goalId === id);
  const directTasks = data.taskDefinitions.filter((task) => task.goalId === id && !task.projectId);
  return projects.every((project) => project.status === 'COMPLETED' || project.status === 'ABANDONED')
    && tasksReady(data, directTasks)
    && (projects.some((project) => project.status === 'COMPLETED') || directTasks.some((task) => task.completedCount + task.completedWeekCount > 0));
}

async function getParentBounds(goalId: string, projectId?: string | null) {
  const db = getDb();
  const bounds = await db.prepare(`
    SELECT
      COALESCE(a.start_date, g.start_date) AS areaStartDate,
      a.own_due_date AS areaDueDate,
      g.start_date AS goalStartDate,
      g.own_due_date AS goalDueDate,
      p.start_date AS projectStartDate,
      p.own_due_date AS projectDueDate
    FROM goals g
    JOIN areas a ON a.id = g.area_id AND a.deleted_at IS NULL AND a.archived_at IS NULL
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
  const color = input.color?.trim() || DEFAULT_AREA_COLOR;
  const preference = await db.prepare("SELECT timezone FROM user_preferences WHERE id = 'default'").first<{ timezone: string }>();
  const startDate = input.startDate || todayInTimeZone(preference?.timezone ?? DEFAULT_TIMEZONE);
  const dueDate = input.dueDate || null;
  if (!name) throw new Error('请输入领域名称');
  if (name.length > 60) throw new Error('领域名称不能超过 60 个字符');
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) throw new Error('领域颜色无效');
  validateDateRange(startDate, dueDate);

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
    INSERT INTO areas (id, name, color, start_date, own_due_date, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, name, color, startDate, dueDate, Number(sortOrder?.value ?? 0), now, now).run();
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
    .prepare('SELECT id, start_date AS startDate, own_due_date AS dueDate FROM areas WHERE id = ? AND deleted_at IS NULL AND archived_at IS NULL')
    .bind(input.areaId)
    .first<{ id: string; startDate: string | null; dueDate: string | null }>();
  if (!area) throw new Error('所属领域不存在');
  if (area.startDate && input.startDate < area.startDate) throw new Error(`开始日期不能早于领域开始日期 ${area.startDate}`);
  if (area.dueDate && (input.startDate > area.dueDate || (dueDate && dueDate > area.dueDate))) throw new Error(`时间不能超过领域边界 ${area.dueDate}`);

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
    SELECT g.start_date AS startDate, g.own_due_date AS dueDate,
      a.start_date AS areaStartDate, a.own_due_date AS areaDueDate
    FROM goals g JOIN areas a ON a.id = g.area_id
    WHERE g.id = ? AND g.deleted_at IS NULL AND g.status = 'ACTIVE'
  `).bind(input.goalId).first<{ startDate: string; dueDate: string | null; areaStartDate: string | null; areaDueDate: string | null }>();
  if (!goal) throw new Error('所属目标不存在或不可用');
  if (input.startDate < goal.startDate) throw new Error(`开始日期不能早于目标开始日期 ${goal.startDate}`);
  const goalEnd = minDate(goal.dueDate, goal.areaDueDate);
  if (goalEnd && input.startDate > goalEnd) throw new Error(`开始日期不能晚于上层边界 ${goalEnd}`);
  if (goalEnd && dueDate && dueDate > goalEnd) throw new Error(`截止日期不能晚于上层边界 ${goalEnd}`);

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
  const earliestStart = [bounds.areaStartDate, bounds.goalStartDate, bounds.projectStartDate]
    .filter((date): date is string => Boolean(date))
    .sort((left, right) => left.localeCompare(right))
    .at(-1)!;
  const latestEnd = minDate(bounds.areaDueDate, bounds.goalDueDate, bounds.projectDueDate);
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

function validatedTitle(value: string, kind: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`请输入${kind}名称`);
  if (value.trim().length > 120) throw new Error(`${kind}名称不能超过 120 个字符`);
  return value.trim();
}

export async function updateArea(id: string, input: CreateAreaInput) {
  const db = getDb();
  const name = validatedTitle(input.name, '领域');
  if (name.length > 60) throw new Error('领域名称不能超过 60 个字符');
  const color = input.color?.trim() || DEFAULT_AREA_COLOR;
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) throw new Error('领域颜色无效');
  const existing = await db.prepare('SELECT id, start_date AS startDate, own_due_date AS dueDate FROM areas WHERE id = ? AND deleted_at IS NULL AND archived_at IS NULL')
    .bind(id).first<{ id: string; startDate: string | null; dueDate: string | null }>();
  if (!existing) throw new Error('领域不存在');
  const startDate = input.startDate || existing.startDate || todayInTimeZone(DEFAULT_TIMEZONE);
  const dueDate = input.dueDate || null;
  validateDateRange(startDate, dueDate);
  const duplicate = await db.prepare('SELECT id FROM areas WHERE name = ? AND id <> ? AND deleted_at IS NULL').bind(name, id).first();
  if (duplicate) throw new Error('已经存在同名领域');
  const child = await db.prepare(`SELECT id FROM goals WHERE area_id = ? AND deleted_at IS NULL
    AND (start_date < ? OR (? IS NOT NULL AND (start_date > ? OR own_due_date > ?))) LIMIT 1`)
    .bind(id, startDate, dueDate, dueDate, dueDate).first();
  if (child) throw new Error('新时间范围与下属目标冲突，请先调整目标');
  if (dueDate) {
    const task = await db.prepare(`SELECT td.id FROM task_definitions td JOIN goals g ON g.id = td.goal_id
      LEFT JOIN recurrence_rules rr ON rr.task_id = td.id
      WHERE g.area_id = ? AND td.deleted_at IS NULL
        AND (td.start_date > ? OR td.own_due_date > ? OR rr.own_end_date > ?) LIMIT 1`)
      .bind(id, dueDate, dueDate, dueDate).first();
    if (task) throw new Error('新截止日期与下属任务冲突，请先调整任务');
    const occurrence = await db.prepare(`SELECT o.id FROM task_occurrences o
      JOIN task_definitions td ON td.id = o.task_id JOIN goals g ON g.id = td.goal_id
      WHERE g.area_id = ? AND td.deleted_at IS NULL AND o.due_date > ? LIMIT 1`)
      .bind(id, dueDate).first();
    if (occurrence) throw new Error('已有任务实例超出新截止日期，请先调整任务');
  }
  if (existing.dueDate && !dueDate && !input.confirmUnboundedRecurrence) {
    const unbounded = await db.prepare(`SELECT td.id FROM task_definitions td
      JOIN goals g ON g.id = td.goal_id LEFT JOIN projects p ON p.id = td.project_id
      JOIN recurrence_rules rr ON rr.task_id = td.id
      WHERE g.area_id = ? AND td.deleted_at IS NULL AND td.definition_status = 'ACTIVE'
        AND rr.series_status = 'ACTIVE' AND rr.own_end_date IS NULL
        AND g.own_due_date IS NULL AND (td.project_id IS NULL OR p.own_due_date IS NULL) LIMIT 1`)
      .bind(id).first();
    if (unbounded) throw new Error('移除领域截止日期会使下属循环任务无限循环，请勾选确认后重试');
  }
  await db.prepare('UPDATE areas SET name = ?, color = ?, start_date = ?, own_due_date = ?, updated_at = ? WHERE id = ?')
    .bind(name, color, startDate, dueDate, new Date().toISOString(), id).run();
  return { id };
}

export async function deleteArea(id: string) {
  const db = getDb();
  const existing = await db.prepare('SELECT id FROM areas WHERE id = ? AND deleted_at IS NULL').bind(id).first();
  if (!existing) throw new Error('领域不存在');
  const child = await db.prepare('SELECT id FROM goals WHERE area_id = ? AND deleted_at IS NULL LIMIT 1').bind(id).first();
  if (child) throw new Error('请先删除或转移该领域下的目标');
  const now = new Date().toISOString();
  await db.prepare('UPDATE areas SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL').bind(now, now, id).run();
  return { id };
}

async function validateGoalChildren(id: string, startDate: string, dueDate: string | null) {
  const db = getDb();
  const project = await db.prepare(`
    SELECT id FROM projects WHERE goal_id = ? AND deleted_at IS NULL
      AND (start_date < ? OR (? IS NOT NULL AND (start_date > ? OR own_due_date > ?))) LIMIT 1
  `).bind(id, startDate, dueDate, dueDate, dueDate).first();
  if (project) throw new Error('新时间范围与下属项目冲突，请先调整项目');
  const task = await db.prepare(`
    SELECT td.id FROM task_definitions td
    LEFT JOIN recurrence_rules rr ON rr.task_id = td.id
    WHERE td.goal_id = ? AND td.deleted_at IS NULL
      AND (td.start_date < ? OR (? IS NOT NULL AND
        (td.start_date > ? OR td.own_due_date > ? OR rr.own_end_date > ?))) LIMIT 1
  `).bind(id, startDate, dueDate, dueDate, dueDate, dueDate).first();
  if (task) throw new Error('新时间范围与下属任务冲突，请先调整任务');
  if (dueDate) {
    const occurrence = await db.prepare(`
      SELECT o.id FROM task_occurrences o JOIN task_definitions td ON td.id = o.task_id
      WHERE td.goal_id = ? AND td.deleted_at IS NULL AND o.due_date > ? LIMIT 1
    `).bind(id, dueDate).first();
    if (occurrence) throw new Error('已有任务实例超出新截止日期，请先调整任务');
  }
}

export async function updateGoal(id: string, input: CreateGoalInput) {
  const db = getDb();
  const title = validatedTitle(input.title, '目标');
  const dueDate = input.dueDate || null;
  validateDateRange(input.startDate, dueDate);
  const existing = await db.prepare('SELECT id, own_due_date AS dueDate, status FROM goals WHERE id = ? AND deleted_at IS NULL').bind(id).first<{ id: string; dueDate: string | null; status: string }>();
  if (!existing) throw new Error('目标不存在');
  if (existing.status !== 'ACTIVE') throw new Error('请先重新打开目标，再修改内容');
  const area = await db.prepare('SELECT id, start_date AS startDate, own_due_date AS dueDate FROM areas WHERE id = ? AND deleted_at IS NULL AND archived_at IS NULL')
    .bind(input.areaId).first<{ id: string; startDate: string | null; dueDate: string | null }>();
  if (!area) throw new Error('所属领域不存在');
  if (area.startDate && input.startDate < area.startDate) throw new Error('开始日期不能早于领域开始日期');
  if (area.dueDate && (input.startDate > area.dueDate || (dueDate && dueDate > area.dueDate))) throw new Error('目标时间不能超过领域边界');
  if (existing.dueDate && !dueDate && !area.dueDate && !input.confirmUnboundedRecurrence) {
    const unbounded = await db.prepare(`
      SELECT td.id FROM task_definitions td
      JOIN recurrence_rules rr ON rr.task_id = td.id
      LEFT JOIN projects p ON p.id = td.project_id AND p.deleted_at IS NULL
      WHERE td.goal_id = ? AND td.deleted_at IS NULL AND td.definition_status = 'ACTIVE'
        AND rr.series_status = 'ACTIVE' AND rr.own_end_date IS NULL
        AND (td.project_id IS NULL OR p.own_due_date IS NULL) LIMIT 1
    `).bind(id).first();
    if (unbounded) throw new Error('移除目标截止日期会使下属循环任务无限循环，请勾选确认后重试');
  }
  await validateGoalChildren(id, input.startDate, dueDate);
  const days = dueDate ? differenceInDays(dueDate, input.startDate) + 1 : null;
  await db.prepare(`
    UPDATE goals SET area_id = ?, title = ?, description = ?, start_date = ?, own_due_date = ?,
      duration_value = ?, duration_days = ?, updated_at = ? WHERE id = ?
  `).bind(input.areaId, title, input.description?.trim() ?? '', input.startDate, dueDate,
    normalizedDurationValue(input.durationValue, days, 'MONTH'), days, new Date().toISOString(), id).run();
  return { id };
}

export async function deleteGoal(id: string) {
  const db = getDb();
  const existing = await db.prepare('SELECT id FROM goals WHERE id = ? AND deleted_at IS NULL').bind(id).first();
  if (!existing) throw new Error('目标不存在');
  const project = await db.prepare('SELECT id FROM projects WHERE goal_id = ? AND deleted_at IS NULL LIMIT 1').bind(id).first();
  const task = await db.prepare('SELECT id FROM task_definitions WHERE goal_id = ? AND deleted_at IS NULL LIMIT 1').bind(id).first();
  if (project || task) throw new Error('请先删除或转移该目标下的项目和任务');
  const now = new Date().toISOString();
  await db.prepare('UPDATE goals SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL').bind(now, now, id).run();
  return { id };
}

async function validateProjectChildren(id: string, startDate: string, dueDate: string | null) {
  const db = getDb();
  const task = await db.prepare(`
    SELECT td.id FROM task_definitions td LEFT JOIN recurrence_rules rr ON rr.task_id = td.id
    WHERE td.project_id = ? AND td.deleted_at IS NULL
      AND (td.start_date < ? OR (? IS NOT NULL AND
        (td.start_date > ? OR td.own_due_date > ? OR rr.own_end_date > ?))) LIMIT 1
  `).bind(id, startDate, dueDate, dueDate, dueDate, dueDate).first();
  if (task) throw new Error('新时间范围与下属任务冲突，请先调整任务');
  if (dueDate) {
    const occurrence = await db.prepare(`
      SELECT o.id FROM task_occurrences o JOIN task_definitions td ON td.id = o.task_id
      WHERE td.project_id = ? AND td.deleted_at IS NULL AND o.due_date > ? LIMIT 1
    `).bind(id, dueDate).first();
    if (occurrence) throw new Error('已有任务实例超出新截止日期，请先调整任务');
  }
}

export async function updateProject(id: string, input: CreateProjectInput) {
  const db = getDb();
  const title = validatedTitle(input.title, '项目');
  const dueDate = input.dueDate || null;
  const displayUnit = input.displayUnit === 'WEEK' ? 'WEEK' : 'DAY';
  validateDateRange(input.startDate, dueDate);
  const existing = await db.prepare('SELECT goal_id AS goalId, own_due_date AS dueDate, status FROM projects WHERE id = ? AND deleted_at IS NULL').bind(id).first<{ goalId: string; dueDate: string | null; status: string }>();
  if (!existing) throw new Error('项目不存在');
  if (existing.status !== 'ACTIVE') throw new Error('请先重新打开项目，再修改内容');
  const goal = await db.prepare(`SELECT g.start_date AS startDate, g.own_due_date AS dueDate,
    a.own_due_date AS areaDueDate FROM goals g JOIN areas a ON a.id = g.area_id
    WHERE g.id = ? AND g.deleted_at IS NULL AND g.status = ?`)
    .bind(input.goalId, 'ACTIVE').first<{ startDate: string; dueDate: string | null; areaDueDate: string | null }>();
  if (!goal) throw new Error('所属目标不存在或不可用');
  if (input.startDate < goal.startDate || (goal.dueDate && input.startDate > goal.dueDate)) throw new Error('开始日期超出目标时间范围');
  if (goal.dueDate && dueDate && dueDate > goal.dueDate) throw new Error('截止日期不能晚于目标边界');
  if (goal.areaDueDate && (input.startDate > goal.areaDueDate || (dueDate && dueDate > goal.areaDueDate))) throw new Error('项目时间不能超过领域边界');
  if (existing.dueDate && !dueDate && !goal.dueDate && !goal.areaDueDate && !input.confirmUnboundedRecurrence) {
    const unbounded = await db.prepare(`
      SELECT td.id FROM task_definitions td JOIN recurrence_rules rr ON rr.task_id = td.id
      WHERE td.project_id = ? AND td.deleted_at IS NULL AND td.definition_status = 'ACTIVE'
        AND rr.series_status = 'ACTIVE' AND rr.own_end_date IS NULL LIMIT 1
    `).bind(id).first();
    if (unbounded) throw new Error('移除项目截止日期会使下属循环任务无限循环，请勾选确认后重试');
  }
  const child = await db.prepare('SELECT id FROM task_definitions WHERE project_id = ? AND deleted_at IS NULL LIMIT 1').bind(id).first();
  if (existing.goalId !== input.goalId && child) throw new Error('项目已有任务，请先转移任务，再更改所属目标');
  await validateProjectChildren(id, input.startDate, dueDate);
  const days = dueDate ? differenceInDays(dueDate, input.startDate) + 1 : null;
  await db.prepare(`
    UPDATE projects SET goal_id = ?, title = ?, description = ?, start_date = ?, own_due_date = ?,
      duration_value = ?, duration_days = ?, display_unit = ?, updated_at = ? WHERE id = ?
  `).bind(input.goalId, title, input.description?.trim() ?? '', input.startDate, dueDate,
    normalizedDurationValue(input.durationValue, days, displayUnit), days, displayUnit,
    new Date().toISOString(), id).run();
  return { id };
}

export async function deleteProject(id: string) {
  const db = getDb();
  const existing = await db.prepare('SELECT id FROM projects WHERE id = ? AND deleted_at IS NULL').bind(id).first();
  if (!existing) throw new Error('项目不存在');
  const child = await db.prepare('SELECT id FROM task_definitions WHERE project_id = ? AND deleted_at IS NULL LIMIT 1').bind(id).first();
  if (child) throw new Error('请先删除或转移该项目下的任务');
  const now = new Date().toISOString();
  await db.prepare('UPDATE projects SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL').bind(now, now, id).run();
  return { id };
}

export async function updateTask(id: string, input: CreateTaskInput) {
  const db = getDb();
  const title = validatedTitle(input.title, '任务');
  const existing = await db.prepare(`
    SELECT type, goal_id AS goalId, project_id AS projectId, start_date AS startDate,
      own_due_date AS dueDate, duration_days AS durationDays, display_unit AS displayUnit
    FROM task_definitions WHERE id = ? AND deleted_at IS NULL
  `).bind(id).first<{ type: 'ONE_TIME' | 'RECURRING'; goalId: string; projectId: string | null; startDate: string; dueDate: string | null; durationDays: number | null; displayUnit: 'DAY' | 'WEEK' }>();
  if (!existing) throw new Error('任务不存在');
  const recurrence = input.recurrence ?? 'NONE';
  if ((existing.type === 'ONE_TIME') !== (recurrence === 'NONE')) throw new Error('已有任务不能切换循环类型；可以删除后重新创建');
  const bounds = await getParentBounds(input.goalId, input.projectId);
  const earliestStart = [bounds.areaStartDate, bounds.goalStartDate, bounds.projectStartDate].filter((date): date is string => Boolean(date)).sort().at(-1)!;
  const latestEnd = minDate(bounds.areaDueDate, bounds.goalDueDate, bounds.projectDueDate);
  if (!isDate(input.startDate)) throw new Error('开始日期无效');
  if (input.startDate < earliestStart || (latestEnd && input.startDate > latestEnd)) throw new Error('开始日期超出上层时间范围');
  const dueDate = input.dueDate || null;
  const endDate = input.recurrenceEndDate || null;
  if (dueDate && (!isDate(dueDate) || dueDate < input.startDate)) throw new Error('截止日期无效');
  if (endDate && (!isDate(endDate) || endDate < input.startDate)) throw new Error('循环结束日期无效');
  if (latestEnd && ((dueDate && dueDate > latestEnd) || (endDate && endDate > latestEnd))) throw new Error('截止日期超出上层时间边界');
  const unit = input.displayUnit === 'WEEK' ? 'WEEK' : 'DAY';
  const provided = input.durationValue ?? null;
  if (provided != null && (!Number.isFinite(provided) || provided <= 0 || (unit === 'DAY' && !Number.isInteger(provided)))) throw new Error('预计时长无效：按日设置时必须为整数');
  const days = recurrence === 'NONE'
    ? dueDate ? differenceInDays(dueDate, input.startDate) + 1 : null
    : provided ? Math.ceil(provided * (unit === 'WEEK' ? 7 : 1)) : 1;
  const now = new Date().toISOString();
  if (recurrence === 'NONE') {
    if (dueDate !== existing.dueDate) {
      const current = await db.prepare('SELECT status, due_date AS dueDate FROM task_occurrences WHERE task_id = ?')
        .bind(id).first<{ status: TaskStatus; dueDate: string | null }>();
      const preference = await db.prepare("SELECT timezone FROM user_preferences WHERE id = 'default'").first<{ timezone: string }>();
      const today = todayInTimeZone(preference?.timezone ?? DEFAULT_TIMEZONE);
      if (current?.status === 'PENDING' && current.dueDate && current.dueDate < today && (!dueDate || dueDate < today)) {
        throw new Error('逾期任务的新截止日期必须为今天或以后，不能清空');
      }
    }
    await db.batch([
      db.prepare(`UPDATE task_definitions SET goal_id = ?, project_id = ?, title = ?, description = ?, start_date = ?, own_due_date = ?, duration_value = ?, duration_days = ?, display_unit = ?, updated_at = ? WHERE id = ?`)
        .bind(input.goalId, input.projectId ?? null, title, input.description?.trim() ?? '', input.startDate, dueDate, normalizedDurationValue(provided, days, unit), days, unit, now, id),
      db.prepare('UPDATE task_occurrences SET scheduled_date = ?, due_date = ?, updated_at = ? WHERE task_id = ?')
        .bind(input.startDate, dueDate, now, id),
    ]);
    return { id };
  }
  if (!['DAILY', 'WEEKLY'].includes(recurrence)) throw new Error('循环方式无效');
  const interval = input.interval ?? 1;
  if (!Number.isInteger(interval) || interval < 1 || interval > 99) throw new Error('循环间隔必须是 1 到 99 的整数');
  const today = todayInTimeZone(DEFAULT_TIMEZONE);
  const historical = await db.prepare(`SELECT COUNT(*) AS count FROM task_occurrences WHERE task_id = ? AND (scheduled_date <= ? OR status <> 'PENDING')`)
    .bind(id, today).first<{ count: number }>();
  if (Number(historical?.count ?? 0) > 0) {
    const rule = await db.prepare('SELECT frequency, interval, own_end_date AS endDate FROM recurrence_rules WHERE task_id = ?').bind(id).first<{ frequency: string; interval: number; endDate: string | null }>();
    if (existing.goalId !== input.goalId || existing.projectId !== (input.projectId || null)
      || existing.startDate !== input.startDate || existing.durationDays !== days || existing.displayUnit !== unit
      || rule?.frequency !== recurrence || rule.interval !== interval || rule.endDate !== endDate) {
      throw new Error('循环任务已有今天或更早的实例；为保留历史记录，目前只能修改名称和备注。请结束旧循环后新建任务以更改安排');
    }
  }
  const weekdays = recurrence === 'WEEKLY' ? JSON.stringify([parseDate(input.startDate).getUTCDay()]) : null;
  await db.batch([
    db.prepare(`UPDATE task_definitions SET goal_id = ?, project_id = ?, title = ?, description = ?, start_date = ?, duration_value = ?, duration_days = ?, display_unit = ?, updated_at = ? WHERE id = ?`)
      .bind(input.goalId, input.projectId ?? null, title, input.description?.trim() ?? '', input.startDate, normalizedDurationValue(provided, days, unit), days, unit, now, id),
    db.prepare("DELETE FROM task_occurrences WHERE task_id = ? AND status = 'PENDING' AND scheduled_date > ?").bind(id, today),
    db.prepare('UPDATE recurrence_rules SET frequency = ?, interval = ?, weekdays = ?, own_end_date = ?, generated_through_date = ?, updated_at = ? WHERE task_id = ?')
      .bind(recurrence, interval, weekdays, endDate, addDays(input.startDate, -1), now, id),
  ]);
  return { id };
}

export async function deleteTask(id: string) {
  const db = getDb();
  const existing = await db.prepare(`
    SELECT td.id, g.status AS goalStatus, p.status AS projectStatus
    FROM task_definitions td JOIN goals g ON g.id = td.goal_id
    LEFT JOIN projects p ON p.id = td.project_id
    WHERE td.id = ? AND td.deleted_at IS NULL
  `).bind(id).first<{ id: string; goalStatus: string; projectStatus: string | null }>();
  if (!existing) throw new Error('任务不存在');
  if (existing.goalStatus !== 'ACTIVE' || (existing.projectStatus && existing.projectStatus !== 'ACTIVE')) {
    throw new Error('请先重新打开已完成的项目或目标，再删除任务');
  }
  const now = new Date().toISOString();
  await db.prepare('UPDATE task_definitions SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL').bind(now, now, id).run();
  return { id };
}

export type DeletedItem = {
  id: string;
  kind: 'AREA' | 'GOAL' | 'PROJECT' | 'TASK';
  title: string;
  deletedAt: string;
};

export async function listDeletedItems(): Promise<DeletedItem[]> {
  const db = getDb();
  const [areas, goals, projects, tasks] = await Promise.all([
    db.prepare('SELECT id, name AS title, deleted_at AS deletedAt FROM areas WHERE deleted_at IS NOT NULL').all<Omit<DeletedItem, 'kind'>>(),
    db.prepare('SELECT id, title, deleted_at AS deletedAt FROM goals WHERE deleted_at IS NOT NULL').all<Omit<DeletedItem, 'kind'>>(),
    db.prepare('SELECT id, title, deleted_at AS deletedAt FROM projects WHERE deleted_at IS NOT NULL').all<Omit<DeletedItem, 'kind'>>(),
    db.prepare('SELECT id, title, deleted_at AS deletedAt FROM task_definitions WHERE deleted_at IS NOT NULL').all<Omit<DeletedItem, 'kind'>>(),
  ]);
  return [
    ...areas.results.map((item) => ({ ...item, kind: 'AREA' as const })),
    ...goals.results.map((item) => ({ ...item, kind: 'GOAL' as const })),
    ...projects.results.map((item) => ({ ...item, kind: 'PROJECT' as const })),
    ...tasks.results.map((item) => ({ ...item, kind: 'TASK' as const })),
  ].sort((left, right) => right.deletedAt.localeCompare(left.deletedAt));
}

export async function restoreDeletedItem(kind: DeletedItem['kind'], id: string) {
  const db = getDb();
  const now = new Date().toISOString();
  if (kind === 'AREA') {
    const area = await db.prepare('SELECT name FROM areas WHERE id = ? AND deleted_at IS NOT NULL').bind(id).first<{ name: string }>();
    if (!area) throw new Error('已删除领域不存在');
    const duplicate = await db.prepare('SELECT id FROM areas WHERE name = ? AND deleted_at IS NULL').bind(area.name).first();
    if (duplicate) throw new Error('已有同名领域，请先重命名现有领域');
    await db.prepare('UPDATE areas SET deleted_at = NULL, archived_at = NULL, updated_at = ? WHERE id = ?').bind(now, id).run();
  } else if (kind === 'GOAL') {
    const goal = await db.prepare('SELECT area_id AS areaId, start_date AS startDate, own_due_date AS dueDate FROM goals WHERE id = ? AND deleted_at IS NOT NULL')
      .bind(id).first<{ areaId: string; startDate: string; dueDate: string | null }>();
    if (!goal) throw new Error('已删除目标不存在');
    const parent = await db.prepare('SELECT start_date AS startDate, own_due_date AS dueDate FROM areas WHERE id = ? AND deleted_at IS NULL AND archived_at IS NULL')
      .bind(goal.areaId).first<{ startDate: string | null; dueDate: string | null }>();
    if (!parent) throw new Error('请先恢复所属领域');
    if ((parent.startDate && goal.startDate < parent.startDate) || (parent.dueDate && (goal.startDate > parent.dueDate || (goal.dueDate && goal.dueDate > parent.dueDate)))) {
      throw new Error('原目标时间已超出领域边界，请先调整领域日期');
    }
    await db.prepare("UPDATE goals SET deleted_at = NULL, status = 'ACTIVE', completed_at = NULL, updated_at = ? WHERE id = ?").bind(now, id).run();
  } else if (kind === 'PROJECT') {
    const project = await db.prepare('SELECT goal_id AS goalId, start_date AS startDate, own_due_date AS dueDate FROM projects WHERE id = ? AND deleted_at IS NOT NULL').bind(id).first<{ goalId: string; startDate: string; dueDate: string | null }>();
    if (!project) throw new Error('已删除项目不存在');
    const parent = await db.prepare(`SELECT g.start_date AS startDate, g.own_due_date AS dueDate,
      a.own_due_date AS areaDueDate FROM goals g JOIN areas a ON a.id = g.area_id
      WHERE g.id = ? AND g.deleted_at IS NULL AND g.status = 'ACTIVE'`)
      .bind(project.goalId).first<{ startDate: string; dueDate: string | null; areaDueDate: string | null }>();
    if (!parent) throw new Error('请先恢复或重新打开所属目标');
    if (project.startDate < parent.startDate || (parent.dueDate && (project.startDate > parent.dueDate || (project.dueDate && project.dueDate > parent.dueDate)))) {
      throw new Error('原项目时间已超出目标边界，请先调整目标日期');
    }
    if (parent.areaDueDate && (project.startDate > parent.areaDueDate || (project.dueDate && project.dueDate > parent.areaDueDate))) throw new Error('原项目时间已超出领域边界，请先调整领域日期');
    await db.prepare("UPDATE projects SET deleted_at = NULL, status = 'ACTIVE', completed_at = NULL, updated_at = ? WHERE id = ?").bind(now, id).run();
  } else if (kind === 'TASK') {
    const task = await db.prepare(`
      SELECT td.goal_id AS goalId, td.project_id AS projectId, td.start_date AS startDate,
        td.own_due_date AS dueDate, rr.own_end_date AS endDate
      FROM task_definitions td LEFT JOIN recurrence_rules rr ON rr.task_id = td.id
      WHERE td.id = ? AND td.deleted_at IS NOT NULL
    `).bind(id).first<{ goalId: string; projectId: string | null; startDate: string; dueDate: string | null; endDate: string | null }>();
    if (!task) throw new Error('已删除任务不存在');
    let bounds: ParentBounds;
    try {
      bounds = await getParentBounds(task.goalId, task.projectId);
    } catch {
      throw new Error('请先恢复或重新打开所属目标和项目');
    }
    const earliest = [bounds.areaStartDate, bounds.goalStartDate, bounds.projectStartDate].filter((date): date is string => Boolean(date)).sort().at(-1)!;
    const latest = minDate(bounds.areaDueDate, bounds.goalDueDate, bounds.projectDueDate);
    if (task.startDate < earliest || (latest && (task.startDate > latest || (task.dueDate && task.dueDate > latest) || (task.endDate && task.endDate > latest)))) {
      throw new Error('原任务时间已超出上层边界，请先调整目标或项目日期');
    }
    await db.prepare('UPDATE task_definitions SET deleted_at = NULL, updated_at = ? WHERE id = ?').bind(now, id).run();
  } else {
    throw new Error('事项类型无效');
  }
  return { id };
}

export async function setRecurringTaskRunning(id: string, running: boolean) {
  const db = getDb();
  const task = await db.prepare(`
    SELECT goal_id AS goalId, project_id AS projectId, type,
      definition_status AS status FROM task_definitions
    WHERE id = ? AND deleted_at IS NULL
  `).bind(id).first<{ goalId: string; projectId: string | null; type: string; status: string }>();
  if (!task || task.type !== 'RECURRING') throw new Error('循环任务不存在');
  if (task.status === (running ? 'ACTIVE' : 'STOPPED')) return { id };
  const preference = await db.prepare("SELECT timezone FROM user_preferences WHERE id = 'default'").first<{ timezone: string }>();
  const today = todayInTimeZone(preference?.timezone ?? DEFAULT_TIMEZONE);
  if (running) {
    const bounds = await getParentBounds(task.goalId, task.projectId);
    const rule = await db.prepare('SELECT own_end_date AS endDate FROM recurrence_rules WHERE task_id = ?').bind(id).first<{ endDate: string | null }>();
    const end = minDate(rule?.endDate, bounds.areaDueDate, bounds.goalDueDate, bounds.projectDueDate);
    if (end && end <= today) throw new Error('循环时间边界已结束，无法恢复；请新建循环任务');
  }
  const now = new Date().toISOString();
  const statements = [
    db.prepare('UPDATE task_definitions SET definition_status = ?, updated_at = ? WHERE id = ?')
      .bind(running ? 'ACTIVE' : 'STOPPED', now, id),
    db.prepare('UPDATE recurrence_rules SET series_status = ?, generated_through_date = ?, updated_at = ? WHERE task_id = ?')
      .bind(running ? 'ACTIVE' : 'STOPPED', today, now, id),
  ];
  if (!running) statements.push(
    db.prepare("DELETE FROM task_occurrences WHERE task_id = ? AND status = 'PENDING' AND scheduled_date > ?")
      .bind(id, today),
  );
  await db.batch(statements);
  return { id };
}

export async function setProjectCompletion(id: string, completed: boolean) {
  const db = getDb();
  const data = await getPlannerData();
  const project = data.projects.find((item) => item.id === id);
  if (!project) throw new Error('项目不存在');
  if (completed) {
    if (project.status === 'COMPLETED') return { id };
    if (!project.canComplete) throw new Error('仍有未处理任务、未结束的循环，或尚无已完成成果');
    const now = new Date().toISOString();
    await db.prepare("UPDATE projects SET status = 'COMPLETED', completed_at = ?, updated_at = ? WHERE id = ? AND status = 'ACTIVE'")
      .bind(now, now, id).run();
  } else {
    if (project.status === 'ACTIVE') return { id };
    if (project.status !== 'COMPLETED') throw new Error('项目当前状态不能重新打开');
    const now = new Date().toISOString();
    const goal = data.goals.find((item) => item.id === project.goalId);
    if (goal?.status === 'ABANDONED') throw new Error('请先恢复所属目标');
    if (goal?.status === 'COMPLETED') throw new Error('请先手动重新打开所属目标');
    await db.prepare("UPDATE projects SET status = 'ACTIVE', completed_at = NULL, updated_at = ? WHERE id = ?").bind(now, id).run();
  }
  return { id };
}

export async function setGoalCompletion(id: string, completed: boolean) {
  const db = getDb();
  const data = await getPlannerData();
  const goal = data.goals.find((item) => item.id === id);
  if (!goal) throw new Error('目标不存在');
  if (completed) {
    if (goal.status === 'COMPLETED') return { id };
    if (!goal.canComplete) throw new Error('仍有未完成项目或任务、未结束的循环，或尚无已完成成果');
    const now = new Date().toISOString();
    await db.prepare("UPDATE goals SET status = 'COMPLETED', completed_at = ?, updated_at = ? WHERE id = ? AND status = 'ACTIVE'")
      .bind(now, now, id).run();
  } else {
    if (goal.status === 'ACTIVE') return { id };
    if (goal.status !== 'COMPLETED') throw new Error('目标当前状态不能重新打开');
    const now = new Date().toISOString();
    await db.prepare("UPDATE goals SET status = 'ACTIVE', completed_at = NULL, updated_at = ? WHERE id = ?").bind(now, id).run();
  }
  return { id };
}

function abandonTaskStatements(condition: string, bindings: string[], today: string, now: string) {
  const db = getDb();
  const targets = `SELECT td.id FROM task_definitions td WHERE ${condition} AND td.deleted_at IS NULL`;
  const recurringTargets = `SELECT td.id FROM task_definitions td WHERE ${condition} AND td.deleted_at IS NULL AND td.type = 'RECURRING'`;
  return [
    db.prepare(`DELETE FROM task_occurrences WHERE task_id IN (${recurringTargets}) AND status = 'PENDING' AND scheduled_date > ?`)
      .bind(...bindings, today),
    db.prepare(`UPDATE task_occurrences SET status = 'CANCELLED', completed_at = NULL, cancelled_at = ?, updated_at = ? WHERE task_id IN (${targets}) AND status = 'PENDING'`)
      .bind(now, now, ...bindings),
    db.prepare(`UPDATE recurrence_rules SET series_status = 'CANCELLED', generated_through_date = ?, updated_at = ? WHERE task_id IN (${recurringTargets})`)
      .bind(today, now, ...bindings),
    db.prepare(`UPDATE task_definitions SET definition_status = 'CANCELLED', updated_at = ? WHERE id IN (${targets})`)
      .bind(now, ...bindings),
  ];
}

export async function setProjectAbandoned(id: string, abandoned: boolean) {
  const db = getDb();
  const data = await getPlannerData();
  const project = data.projects.find((item) => item.id === id);
  if (!project) throw new Error('项目不存在');
  if (!abandoned) {
    if (project.status === 'ACTIVE') return { id };
    if (project.status !== 'ABANDONED') throw new Error('请先重新打开已完成项目');
    const goal = data.goals.find((item) => item.id === project.goalId);
    if (goal?.status !== 'ACTIVE') throw new Error('请先恢复或重新打开所属目标');
    const now = new Date().toISOString();
    await db.prepare("UPDATE projects SET status = 'ACTIVE', abandoned_at = NULL, updated_at = ? WHERE id = ?").bind(now, id).run();
    return { id };
  }
  if (project.status === 'ABANDONED') return { id };
  if (project.status !== 'ACTIVE') throw new Error('请先重新打开已完成项目');
  const goal = data.goals.find((item) => item.id === project.goalId);
  if (goal?.status !== 'ACTIVE') throw new Error('所属目标当前不可用');
  if (data.occurrences.some((item) => item.projectId === id && item.status === 'PENDING' && item.dueDate && item.dueDate < data.today)) {
    throw new Error('请先手动清理项目中的逾期记录，再放弃项目');
  }
  const now = new Date().toISOString();
  const statements = abandonTaskStatements('td.project_id = ?', [id], data.today, now);
  statements.push(db.prepare("UPDATE projects SET status = 'ABANDONED', abandoned_at = ?, updated_at = ? WHERE id = ?").bind(now, now, id));
  await db.batch(statements);
  return { id };
}

export async function setGoalAbandoned(id: string, abandoned: boolean) {
  const db = getDb();
  const data = await getPlannerData();
  const goal = data.goals.find((item) => item.id === id);
  if (!goal) throw new Error('目标不存在');
  if (!abandoned) {
    if (goal.status === 'ACTIVE') return { id };
    if (goal.status !== 'ABANDONED') throw new Error('请先重新打开已完成目标');
    const now = new Date().toISOString();
    await db.prepare("UPDATE goals SET status = 'ACTIVE', abandoned_at = NULL, updated_at = ? WHERE id = ?").bind(now, id).run();
    return { id };
  }
  if (goal.status === 'ABANDONED') return { id };
  if (goal.status !== 'ACTIVE') throw new Error('请先重新打开已完成目标');
  if (data.occurrences.some((item) => item.goalId === id && item.status === 'PENDING' && item.dueDate && item.dueDate < data.today)) {
    throw new Error('请先手动清理目标中的逾期记录，再放弃目标');
  }
  const now = new Date().toISOString();
  const condition = "td.goal_id = ? AND (td.project_id IS NULL OR td.project_id IN (SELECT id FROM projects WHERE goal_id = ? AND status = 'ACTIVE' AND deleted_at IS NULL))";
  const statements = abandonTaskStatements(condition, [id, id], data.today, now);
  statements.push(db.prepare("UPDATE projects SET status = 'ABANDONED', abandoned_at = ?, updated_at = ? WHERE goal_id = ? AND status = 'ACTIVE' AND deleted_at IS NULL").bind(now, now, id));
  statements.push(db.prepare("UPDATE goals SET status = 'ABANDONED', abandoned_at = ?, updated_at = ? WHERE id = ?").bind(now, now, id));
  await db.batch(statements);
  return { id };
}

export async function updateOccurrenceStatus(id: string, status: TaskStatus) {
  const db = getDb();
  if (!['PENDING', 'COMPLETED', 'CANCELLED'].includes(status)) throw new Error('任务状态无效');
  const existing = await db.prepare(`
    SELECT o.id, o.status, o.due_date AS dueDate, o.scheduled_date AS scheduledDate,
      td.project_id AS projectId, td.goal_id AS goalId, rr.frequency AS frequency,
      p.status AS projectStatus, g.status AS goalStatus
    FROM task_occurrences o
    JOIN task_definitions td ON td.id = o.task_id
    JOIN goals g ON g.id = td.goal_id
    LEFT JOIN projects p ON p.id = td.project_id
    LEFT JOIN recurrence_rules rr ON rr.task_id = td.id
    WHERE o.id = ? AND td.deleted_at IS NULL
  `).bind(id).first<{ id: string; status: TaskStatus; dueDate: string | null; scheduledDate: string; projectId: string | null; goalId: string; frequency: string | null; projectStatus: string | null; goalStatus: string }>();
  if (!existing) throw new Error('任务不存在');
  if (existing.status === status) return;
  const preference = await db.prepare("SELECT timezone FROM user_preferences WHERE id = 'default'").first<{ timezone: string }>();
  const today = todayInTimeZone(preference?.timezone ?? DEFAULT_TIMEZONE);
  if (existing.dueDate && existing.dueDate < today) throw new Error('逾期记录只能手动清理，不能修改状态');
  if (existing.goalStatus === 'ABANDONED' || existing.projectStatus === 'ABANDONED') throw new Error('请先恢复已放弃的上层事项');
  if (existing.goalStatus === 'COMPLETED') throw new Error('请先手动重新打开所属目标');
  if (existing.projectStatus === 'COMPLETED') throw new Error('请先手动重新打开所属项目');
  if (existing.frequency === 'WEEKLY' && status === 'PENDING') {
    const weekCompleted = await db.prepare('SELECT 1 FROM recurrence_week_completions WHERE task_id = (SELECT task_id FROM task_occurrences WHERE id = ?) AND week_start = ?')
      .bind(id, weekStart(existing.scheduledDate)).first();
    if (weekCompleted) throw new Error('请先撤回本周完成，再撤回今日操作');
  }

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

export async function rescheduleOverdueTask(id: string, dueDate: string) {
  const db = getDb();
  const preference = await db.prepare("SELECT timezone FROM user_preferences WHERE id = 'default'").first<{ timezone: string }>();
  const today = todayInTimeZone(preference?.timezone ?? DEFAULT_TIMEZONE);
  if (!isDate(dueDate) || dueDate < today) throw new Error('新截止日期不能早于今天');

  const occurrence = await db.prepare(`
    SELECT o.status, o.due_date AS dueDate, td.id AS taskId, td.type,
      td.start_date AS startDate, td.goal_id AS goalId, td.project_id AS projectId,
      td.display_unit AS displayUnit
    FROM task_occurrences o JOIN task_definitions td ON td.id = o.task_id
    WHERE o.id = ? AND td.deleted_at IS NULL
  `).bind(id).first<{
    status: TaskStatus;
    dueDate: string | null;
    taskId: string;
    type: 'ONE_TIME' | 'RECURRING';
    startDate: string;
    goalId: string;
    projectId: string | null;
    displayUnit: 'DAY' | 'WEEK';
  }>();
  if (!occurrence || occurrence.type !== 'ONE_TIME' || occurrence.status !== 'PENDING'
    || !occurrence.dueDate || occurrence.dueDate >= today) {
    throw new Error('只有未处理的普通逾期任务可以重设截止日期');
  }

  const bounds = await getParentBounds(occurrence.goalId, occurrence.projectId);
  const latestEnd = minDate(bounds.areaDueDate, bounds.goalDueDate, bounds.projectDueDate);
  if (latestEnd && latestEnd < today) throw new Error('上层截止日期已过，请先调整上层事项');
  if (latestEnd && dueDate > latestEnd) throw new Error(`新截止日期不能超过上层边界 ${latestEnd}`);
  const durationDays = differenceInDays(dueDate, occurrence.startDate) + 1;
  const now = new Date().toISOString();
  await db.batch([
    db.prepare(`UPDATE task_definitions SET own_due_date = ?, duration_days = ?, duration_value = ?, updated_at = ? WHERE id = ?`)
      .bind(dueDate, durationDays, normalizedDurationValue(null, durationDays, occurrence.displayUnit), now, occurrence.taskId),
    db.prepare('UPDATE task_occurrences SET due_date = ?, updated_at = ? WHERE id = ?')
      .bind(dueDate, now, id),
  ]);
  return { id };
}

export async function clearOverdueOccurrence(id: string) {
  const db = getDb();
  const preference = await db.prepare("SELECT timezone FROM user_preferences WHERE id = 'default'").first<{ timezone: string }>();
  const today = todayInTimeZone(preference?.timezone ?? DEFAULT_TIMEZONE);
  const occurrence = await db.prepare(`
    SELECT o.id, o.due_date AS dueDate, o.status, td.id AS taskId, td.type
    FROM task_occurrences o JOIN task_definitions td ON td.id = o.task_id
    WHERE o.id = ? AND td.deleted_at IS NULL
  `).bind(id).first<{ id: string; dueDate: string | null; status: TaskStatus; taskId: string; type: string }>();
  if (!occurrence || occurrence.status !== 'PENDING' || !occurrence.dueDate || occurrence.dueDate >= today) {
    throw new Error('只有未处理的逾期记录可以清理');
  }
  if (occurrence.type === 'ONE_TIME') {
    await deleteTask(occurrence.taskId);
  } else {
    await db.prepare('DELETE FROM task_occurrences WHERE id = ?').bind(id).run();
  }
  return { id };
}

export async function setWeeklyCycleComplete(id: string, completed: boolean) {
  const db = getDb();
  const preference = await db.prepare("SELECT timezone FROM user_preferences WHERE id = 'default'").first<{ timezone: string }>();
  const today = todayInTimeZone(preference?.timezone ?? DEFAULT_TIMEZONE);
  const task = await db.prepare(`
    SELECT td.id, td.start_date AS startDate, td.goal_id AS goalId, td.project_id AS projectId,
      rr.frequency, rr.interval, rr.own_end_date AS ownEndDate,
      td.definition_status AS status
    FROM task_definitions td JOIN recurrence_rules rr ON rr.task_id = td.id
    WHERE td.id = ? AND td.deleted_at IS NULL
  `).bind(id).first<{ id: string; startDate: string; goalId: string; projectId: string | null; frequency: string; interval: number; ownEndDate: string | null; status: string }>();
  if (!task || task.frequency !== 'WEEKLY') throw new Error('按周循环任务不存在');
  const parent = await db.prepare(`
    SELECT g.status AS goalStatus, p.status AS projectStatus
    FROM goals g LEFT JOIN projects p ON p.id = ?
    WHERE g.id = ? AND g.deleted_at IS NULL
  `).bind(task.projectId, task.goalId).first<{ goalStatus: string; projectStatus: string | null }>();
  if (parent?.goalStatus === 'COMPLETED') throw new Error('请先手动重新打开所属目标');
  if (parent?.goalStatus === 'ABANDONED') throw new Error('请先恢复所属目标');
  if (parent?.projectStatus === 'COMPLETED') throw new Error('请先手动重新打开所属项目');
  if (parent?.projectStatus === 'ABANDONED') throw new Error('请先恢复所属项目');
  const currentWeek = weekStart(today);
  if (completed) {
    if (task.status !== 'ACTIVE') throw new Error('请先恢复循环任务');
    const bounds = await getParentBounds(task.goalId, task.projectId);
    const end = minDate(task.ownEndDate, bounds.areaDueDate, bounds.goalDueDate, bounds.projectDueDate);
    const weekIndex = differenceInDays(currentWeek, weekStart(task.startDate)) / 7;
    if (today < task.startDate || (end && today > end) || weekIndex % task.interval !== 0) throw new Error('本周不在循环范围内');
    const now = new Date().toISOString();
    await db.batch([
      db.prepare('INSERT OR IGNORE INTO recurrence_week_completions (task_id, week_start, completed_at) VALUES (?, ?, ?)').bind(id, currentWeek, now),
      db.prepare("DELETE FROM task_occurrences WHERE task_id = ? AND status = 'PENDING' AND scheduled_date >= ? AND scheduled_date <= ?")
        .bind(id, today, addDays(currentWeek, 6)),
    ]);
  } else {
    await getParentBounds(task.goalId, task.projectId);
    const weekCompleted = await db.prepare('SELECT 1 FROM recurrence_week_completions WHERE task_id = ? AND week_start = ?')
      .bind(id, currentWeek).first();
    if (!weekCompleted) return { id };
    const now = new Date().toISOString();
    await db.batch([
      db.prepare('DELETE FROM recurrence_week_completions WHERE task_id = ? AND week_start = ?').bind(id, currentWeek),
      db.prepare('UPDATE recurrence_rules SET generated_through_date = ?, updated_at = ? WHERE task_id = ?').bind(addDays(today, -1), now, id),
    ]);
  }
  return { id };
}
