import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

const timestamps = {
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
};

export const areas = sqliteTable('areas', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  color: text('color').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  archivedAt: text('archived_at'),
  deletedAt: text('deleted_at'),
  ...timestamps,
});

export const goals = sqliteTable(
  'goals',
  {
    id: text('id').primaryKey(),
    areaId: text('area_id')
      .notNull()
      .references(() => areas.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    startDate: text('start_date').notNull(),
    ownDueDate: text('own_due_date'),
    durationValue: real('duration_value'),
    durationDays: integer('duration_days'),
    displayUnit: text('display_unit').notNull().default('MONTH'),
    status: text('status').notNull().default('ACTIVE'),
    completedAt: text('completed_at'),
    abandonedAt: text('abandoned_at'),
    sortOrder: integer('sort_order').notNull().default(0),
    deletedAt: text('deleted_at'),
    ...timestamps,
  },
  (table) => [index('idx_goals_area').on(table.areaId)],
);

export const projects = sqliteTable(
  'projects',
  {
    id: text('id').primaryKey(),
    goalId: text('goal_id')
      .notNull()
      .references(() => goals.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    startDate: text('start_date').notNull(),
    ownDueDate: text('own_due_date'),
    durationValue: real('duration_value'),
    durationDays: integer('duration_days'),
    displayUnit: text('display_unit').notNull().default('DAY'),
    status: text('status').notNull().default('ACTIVE'),
    completedAt: text('completed_at'),
    abandonedAt: text('abandoned_at'),
    sortOrder: integer('sort_order').notNull().default(0),
    deletedAt: text('deleted_at'),
    ...timestamps,
  },
  (table) => [index('idx_projects_goal').on(table.goalId)],
);

export const taskDefinitions = sqliteTable(
  'task_definitions',
  {
    id: text('id').primaryKey(),
    goalId: text('goal_id')
      .notNull()
      .references(() => goals.id, { onDelete: 'cascade' }),
    projectId: text('project_id').references(() => projects.id, { onDelete: 'set null' }),
    type: text('type').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    startDate: text('start_date').notNull(),
    ownDueDate: text('own_due_date'),
    durationValue: real('duration_value'),
    durationDays: integer('duration_days'),
    displayUnit: text('display_unit').notNull().default('DAY'),
    definitionStatus: text('definition_status').notNull().default('ACTIVE'),
    sortOrder: integer('sort_order').notNull().default(0),
    deletedAt: text('deleted_at'),
    ...timestamps,
  },
  (table) => [
    index('idx_task_definitions_goal').on(table.goalId),
    index('idx_task_definitions_project').on(table.projectId),
  ],
);

export const recurrenceRules = sqliteTable('recurrence_rules', {
  id: text('id').primaryKey(),
  taskId: text('task_id')
    .notNull()
    .references(() => taskDefinitions.id, { onDelete: 'cascade' }),
  frequency: text('frequency').notNull(),
  interval: integer('interval').notNull().default(1),
  weekdays: text('weekdays'),
  ownEndDate: text('own_end_date'),
  generatedThroughDate: text('generated_through_date'),
  seriesStatus: text('series_status').notNull().default('ACTIVE'),
  ...timestamps,
}, (table) => [uniqueIndex('uq_recurrence_rules_task').on(table.taskId)]);

export const taskOccurrences = sqliteTable(
  'task_occurrences',
  {
    id: text('id').primaryKey(),
    taskId: text('task_id')
      .notNull()
      .references(() => taskDefinitions.id, { onDelete: 'cascade' }),
    scheduledDate: text('scheduled_date').notNull(),
    dueDate: text('due_date'),
    status: text('status').notNull().default('PENDING'),
    completedAt: text('completed_at'),
    cancelledAt: text('cancelled_at'),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('uq_task_occurrences_task_date').on(table.taskId, table.scheduledDate),
    index('idx_task_occurrences_status_due').on(table.status, table.dueDate),
    index('idx_task_occurrences_scheduled').on(table.scheduledDate),
  ],
);

export const userPreferences = sqliteTable('user_preferences', {
  id: text('id').primaryKey(),
  timezone: text('timezone').notNull().default('Asia/Shanghai'),
  upcomingDays: integer('upcoming_days').notNull().default(14),
  ...timestamps,
});
