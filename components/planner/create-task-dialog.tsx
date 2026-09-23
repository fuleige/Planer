'use client';

import { useMemo, useState, type SyntheticEvent } from 'react';
import { CalendarPlus, Loader2, Repeat2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { addDays, differenceInDays } from '@/lib/date';
import type { GoalSummary, ProjectSummary } from '@/lib/planner-types';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goals: GoalSummary[];
  projects: ProjectSummary[];
  today: string;
  onCreated: () => Promise<void>;
};

function durationDays(value: string, unit: 'DAY' | 'WEEK') {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.max(Math.ceil(amount * (unit === 'WEEK' ? 7 : 1)), 1);
}

function formatDuration(days: number, unit: 'DAY' | 'WEEK') {
  if (unit === 'DAY') return String(days);
  return (days / 7).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
}

export function CreateTaskDialog({
  open,
  onOpenChange,
  goals,
  projects,
  today,
  onCreated,
}: Props) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [goalId, setGoalId] = useState(goals[0]?.id ?? '');
  const [projectId, setProjectId] = useState('');
  const [startDate, setStartDate] = useState(
    goals[0]?.startDate && goals[0].startDate > today ? goals[0].startDate : today,
  );
  const [dueDate, setDueDate] = useState('');
  const [duration, setDuration] = useState('');
  const [displayUnit, setDisplayUnit] = useState<'DAY' | 'WEEK'>('DAY');
  const [recurrence, setRecurrence] = useState<'NONE' | 'DAILY' | 'WEEKLY'>('NONE');
  const [interval, setInterval] = useState(1);
  const [recurrenceEndDate, setRecurrenceEndDate] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const availableProjects = useMemo(
    () => projects.filter((project) => project.goalId === goalId),
    [goalId, projects],
  );

  const selectedGoal = useMemo(
    () => goals.find((goal) => goal.id === goalId) ?? null,
    [goalId, goals],
  );
  const selectedProject = useMemo(
    () => projects.find((project) => project.id === projectId) ?? null,
    [projectId, projects],
  );
  const earliestStart = [selectedGoal?.startDate, selectedProject?.startDate]
    .filter((date): date is string => Boolean(date))
    .sort()
    .at(-1);
  const latestEnd = [selectedGoal?.ownDueDate, selectedProject?.ownDueDate]
    .filter((date): date is string => Boolean(date))
    .sort()
    .at(0);

  const reset = () => {
    setTitle('');
    setDescription('');
    setProjectId('');
    setStartDate(selectedGoal?.startDate && selectedGoal.startDate > today ? selectedGoal.startDate : today);
    setDueDate('');
    setDuration('');
    setDisplayUnit('DAY');
    setRecurrence('NONE');
    setInterval(1);
    setRecurrenceEndDate('');
    setError('');
  };

  const changeStartDate = (value: string) => {
    setStartDate(value);
    if (recurrence !== 'NONE') return;
    const days = durationDays(duration, displayUnit);
    if (value && days) setDueDate(addDays(value, days - 1));
    else if (dueDate && dueDate < value) {
      setDueDate('');
      setDuration('');
    }
  };

  const changeDuration = (value: string) => {
    setDuration(value);
    if (recurrence !== 'NONE') return;
    const days = durationDays(value, displayUnit);
    setDueDate(startDate && days ? addDays(startDate, days - 1) : '');
  };

  const changeDueDate = (value: string) => {
    setDueDate(value);
    if (!value || !startDate || value < startDate) {
      setDuration('');
      return;
    }
    setDuration(formatDuration(differenceInDays(value, startDate) + 1, displayUnit));
  };

  const changeDisplayUnit = (value: 'DAY' | 'WEEK') => {
    setDisplayUnit(value);
    if (recurrence === 'NONE' && startDate && dueDate && dueDate >= startDate) {
      setDuration(formatDuration(differenceInDays(dueDate, startDate) + 1, value));
    }
  };

  const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title,
          description,
          goalId,
          projectId: projectId || null,
          startDate,
          dueDate: recurrence === 'NONE' ? dueDate || null : null,
          durationValue: duration ? Number(duration) : null,
          displayUnit,
          recurrence,
          interval,
          recurrenceEndDate: recurrence === 'NONE' ? null : recurrenceEndDate || null,
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || '无法创建任务');
      await onCreated();
      reset();
      onOpenChange(false);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '无法创建任务');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto p-5 sm:max-w-lg">
        <DialogHeader>
          <div className="mb-1 grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
            <CalendarPlus className="size-5" />
          </div>
          <DialogTitle className="text-lg">新建任务</DialogTitle>
          <DialogDescription>任务必须属于一个目标，项目可以不选择。</DialogDescription>
        </DialogHeader>

        <form id="create-task-form" className="space-y-5" onSubmit={submit}>
          <div className="space-y-2">
            <Label htmlFor="task-title">任务名称</Label>
            <Input
              id="task-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="例如：完成移动端导航"
              maxLength={120}
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="task-goal">所属目标</Label>
              <NativeSelect
                id="task-goal"
                className="w-full"
                value={goalId}
                onChange={(event) => {
                  const nextGoal = goals.find((goal) => goal.id === event.target.value);
                  setGoalId(event.target.value);
                  setProjectId('');
                  setStartDate(nextGoal && nextGoal.startDate > today ? nextGoal.startDate : today);
                  setDueDate('');
                  setDuration('');
                  setRecurrenceEndDate('');
                }}
                required
              >
                {goals.map((goal) => (
                  <NativeSelectOption key={goal.id} value={goal.id}>{goal.title}</NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-2">
              <Label htmlFor="task-project">所属项目</Label>
              <NativeSelect
                id="task-project"
                className="w-full"
                value={projectId}
                onChange={(event) => {
                  const nextProject = projects.find((project) => project.id === event.target.value);
                  setProjectId(event.target.value);
                  if (nextProject && nextProject.startDate > startDate) setStartDate(nextProject.startDate);
                  setDueDate('');
                  setDuration('');
                  setRecurrenceEndDate('');
                }}
              >
                <NativeSelectOption value="">不属于项目</NativeSelectOption>
                {availableProjects.map((project) => (
                  <NativeSelectOption key={project.id} value={project.id}>{project.title}</NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="task-start">开始日期</Label>
              <Input id="task-start" type="date" min={earliestStart} max={latestEnd} value={startDate} onChange={(event) => changeStartDate(event.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="task-duration">预计时长</Label>
              <div className="grid grid-cols-[1fr_92px] gap-2">
                <Input
                  id="task-duration"
                  type="number"
                  min={displayUnit === 'DAY' ? 1 : 0.1}
                  step={displayUnit === 'DAY' ? 1 : 0.1}
                  value={duration}
                  onChange={(event) => changeDuration(event.target.value)}
                  placeholder={recurrence === 'NONE' ? '可选' : '默认 1'}
                />
                <NativeSelect aria-label="任务时长单位" value={displayUnit} onChange={(event) => changeDisplayUnit(event.target.value as 'DAY' | 'WEEK')}>
                  <NativeSelectOption value="DAY">天</NativeSelectOption>
                  <NativeSelectOption value="WEEK">周</NativeSelectOption>
                </NativeSelect>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            {recurrence === 'NONE' ? (
              <>
                <Label htmlFor="task-due">截止日期</Label>
                <Input id="task-due" type="date" min={startDate} max={latestEnd} value={dueDate} onChange={(event) => changeDueDate(event.target.value)} />
              </>
            ) : (
              <>
                <Label htmlFor="task-repeat-end">循环结束日期</Label>
                <Input id="task-repeat-end" type="date" min={startDate} max={latestEnd} value={recurrenceEndDate} onChange={(event) => setRecurrenceEndDate(event.target.value)} />
              </>
            )}
            <p className="text-xs leading-5 text-muted-foreground">
              {recurrence === 'NONE'
                ? '填写时长会自动计算截止日期，也可以直接修改截止日期；不填写则没有截止日期。'
                : '预计时长用于计算每次循环的截止日期；不填写时每次按 1 天处理。'}
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-muted/35 p-4">
            <div className="mb-3 flex items-center gap-2">
              <Repeat2 className="size-4 text-primary" />
              <Label htmlFor="task-recurrence">循环方式</Label>
            </div>
            <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
              <NativeSelect
                id="task-recurrence"
                className="w-full"
                value={recurrence}
                onChange={(event) => {
                  const nextRecurrence = event.target.value as typeof recurrence;
                  setRecurrence(nextRecurrence);
                  if (nextRecurrence === 'NONE') {
                    const days = durationDays(duration, displayUnit);
                    setDueDate(startDate && days ? addDays(startDate, days - 1) : '');
                  } else {
                    setDueDate('');
                  }
                }}
              >
                <NativeSelectOption value="NONE">不循环</NativeSelectOption>
                <NativeSelectOption value="DAILY">按日循环</NativeSelectOption>
                <NativeSelectOption value="WEEKLY">按周循环</NativeSelectOption>
              </NativeSelect>
              {recurrence !== 'NONE' ? (
                <div className="flex items-center gap-2">
                  <span className="whitespace-nowrap text-xs text-muted-foreground">每</span>
                  <Input
                    aria-label="循环间隔"
                    type="number"
                    min={1}
                    max={99}
                    value={interval}
                    onChange={(event) => setInterval(Number(event.target.value))}
                  />
                  <span className="whitespace-nowrap text-xs text-muted-foreground">{recurrence === 'DAILY' ? '天' : '周'}</span>
                </div>
              ) : null}
            </div>
            {recurrence !== 'NONE' && !recurrenceEndDate ? (
              <p className="mt-3 text-xs leading-5 text-muted-foreground">未设置结束日期时，循环会受到所属目标或项目的最晚时间边界约束；没有上层边界则无限循环。</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="task-description">备注</Label>
            <Textarea
              id="task-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="可选"
              className="min-h-20 resize-none"
            />
          </div>

          {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p> : null}
        </form>

        <DialogFooter className="-mx-5 -mb-5 px-5">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button type="submit" form="create-task-form" disabled={submitting || !title.trim() || !goalId}>
            {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
            创建任务
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
