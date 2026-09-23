export type TaskStatus = 'PENDING' | 'COMPLETED' | 'CANCELLED';

export type PlannerOccurrence = {
  id: string;
  taskId: string;
  title: string;
  description: string;
  type: 'ONE_TIME' | 'RECURRING';
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
  taskCount: number;
};

export type GoalSummary = {
  id: string;
  areaId: string;
  title: string;
  startDate: string;
  ownDueDate: string | null;
  status: 'ACTIVE' | 'COMPLETED' | 'ABANDONED';
};

export type ProjectSummary = {
  id: string;
  goalId: string;
  title: string;
  startDate: string;
  ownDueDate: string | null;
  status: 'ACTIVE' | 'COMPLETED' | 'ABANDONED';
};

export type TaskDefinitionSummary = {
  id: string;
  goalId: string;
  projectId: string | null;
  title: string;
  type: 'ONE_TIME' | 'RECURRING';
  startDate: string;
  ownDueDate: string | null;
  durationValue: number | null;
  durationDays: number | null;
  displayUnit: 'DAY' | 'WEEK';
  definitionStatus: 'ACTIVE' | 'STOPPED' | 'CANCELLED';
  pendingCount: number;
  completedCount: number;
  cancelledCount: number;
  frequency: 'DAILY' | 'WEEKLY' | null;
  interval: number | null;
  ownEndDate: string | null;
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
