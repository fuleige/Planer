export type TaskStatus = 'PENDING' | 'COMPLETED' | 'CANCELLED';

export type PlannerOccurrence = {
  id: string;
  taskId: string;
  title: string;
  description: string;
  taskStartDate: string;
  taskOwnDueDate: string | null;
  recurrenceEndDate: string | null;
  areaDueDate: string | null;
  goalDueDate: string | null;
  projectDueDate: string | null;
  type: 'ONE_TIME' | 'RECURRING';
  definitionStatus: 'ACTIVE' | 'STOPPED' | 'CANCELLED';
  scheduledDate: string;
  dueDate: string | null;
  status: TaskStatus;
  completedAt: string | null;
  cancelledAt: string | null;
  goalId: string;
  goalTitle: string;
  projectId: string | null;
  projectTitle: string | null;
  areaId: string;
  areaName: string;
  areaColor: string;
  frequency: 'DAILY' | 'WEEKLY' | null;
  interval: number | null;
};

export type AreaSummary = {
  id: string;
  name: string;
  color: string;
  startDate: string;
  ownDueDate: string | null;
  taskCount: number;
};

export type GoalSummary = {
  id: string;
  areaId: string;
  title: string;
  description: string;
  startDate: string;
  ownDueDate: string | null;
  durationValue: number | null;
  status: 'ACTIVE' | 'COMPLETED' | 'ABANDONED';
  completedAt: string | null;
  abandonedAt: string | null;
  canComplete: boolean;
};

export type ProjectSummary = {
  id: string;
  goalId: string;
  title: string;
  description: string;
  startDate: string;
  ownDueDate: string | null;
  durationValue: number | null;
  displayUnit: 'DAY' | 'WEEK';
  status: 'ACTIVE' | 'COMPLETED' | 'ABANDONED';
  completedAt: string | null;
  abandonedAt: string | null;
  canComplete: boolean;
};

export type TaskDefinitionSummary = {
  id: string;
  goalId: string;
  projectId: string | null;
  title: string;
  description: string;
  type: 'ONE_TIME' | 'RECURRING';
  startDate: string;
  ownDueDate: string | null;
  durationValue: number | null;
  durationDays: number | null;
  displayUnit: 'DAY' | 'WEEK';
  definitionStatus: 'ACTIVE' | 'STOPPED' | 'CANCELLED';
  pendingCount: number;
  completedCount: number;
  completedWeekCount: number;
  cancelledCount: number;
  lastHandledAt: string | null;
  frequency: 'DAILY' | 'WEEKLY' | null;
  interval: number | null;
  ownEndDate: string | null;
  autoDeletedOverdueCount: number;
  currentWeekCompleted: boolean;
};

export type PlannerData = {
  today: string;
  timeZone: string;
  upcomingDays: number;
  areas: AreaSummary[];
  goals: GoalSummary[];
  projects: ProjectSummary[];
  taskDefinitions: TaskDefinitionSummary[];
  occurrences: PlannerOccurrence[];
};
