'use client';

import { useMemo, useState, type SyntheticEvent } from 'react';
import { FolderKanban, Layers3, Loader2, Target } from 'lucide-react';
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
import type { AreaSummary, GoalSummary } from '@/lib/planner-types';

export type StructureKind = 'AREA' | 'GOAL' | 'PROJECT';

type Props = {
  kind: StructureKind;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  areas: AreaSummary[];
  goals: GoalSummary[];
  today: string;
  onCreated: () => Promise<void>;
};

const config = {
  AREA: {
    title: '新建领域',
    description: '领域用于归纳长期关注方向，不包含完成状态。',
    nameLabel: '领域名称',
    placeholder: '例如：工作、健康、个人成长',
    endpoint: '/api/areas',
    icon: Layers3,
  },
  GOAL: {
    title: '新建目标',
    description: '目标必须属于一个领域，时间按月估算，每月固定按 30 天计算。',
    nameLabel: '目标名称',
    placeholder: '例如：完成事项规划系统第一版',
    endpoint: '/api/goals',
    icon: Target,
  },
  PROJECT: {
    title: '新建项目',
    description: '项目必须属于一个目标，截止日期不能超过目标的时间边界。',
    nameLabel: '项目名称',
    placeholder: '例如：第一版产品实现',
    endpoint: '/api/projects',
    icon: FolderKanban,
  },
} as const;

function formatDuration(days: number, unit: 'DAY' | 'WEEK' | 'MONTH') {
  const divisor = unit === 'MONTH' ? 30 : unit === 'WEEK' ? 7 : 1;
  const value = days / divisor;
  return unit === 'DAY'
    ? String(Math.round(value))
    : value.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
}

function durationDays(value: string, unit: 'DAY' | 'WEEK' | 'MONTH') {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const multiplier = unit === 'MONTH' ? 30 : unit === 'WEEK' ? 7 : 1;
  return Math.max(Math.ceil(amount * multiplier), 1);
}

export function CreateStructureDialog({
  kind,
  open,
  onOpenChange,
  areas,
  goals,
  today,
  onCreated,
}: Props) {
  const details = config[kind];
  const Icon = details.icon;
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('#6366f1');
  const [areaId, setAreaId] = useState(areas[0]?.id ?? '');
  const [goalId, setGoalId] = useState(goals[0]?.id ?? '');
  const [startDate, setStartDate] = useState(
    kind === 'PROJECT' && goals[0]?.startDate && goals[0].startDate > today
      ? goals[0].startDate
      : today,
  );
  const [dueDate, setDueDate] = useState('');
  const [duration, setDuration] = useState('');
  const [projectUnit, setProjectUnit] = useState<'DAY' | 'WEEK'>('DAY');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const selectedGoal = useMemo(
    () => goals.find((goal) => goal.id === goalId) ?? null,
    [goalId, goals],
  );
  const unit = kind === 'GOAL' ? 'MONTH' : projectUnit;

  const reset = () => {
    setTitle('');
    setDescription('');
    setColor('#6366f1');
    setDueDate('');
    setDuration('');
    setProjectUnit('DAY');
    setStartDate(today);
    setError('');
  };

  const changeStartDate = (value: string) => {
    setStartDate(value);
    const days = durationDays(duration, unit);
    if (value && days) setDueDate(addDays(value, days - 1));
    else if (dueDate && dueDate < value) {
      setDueDate('');
      setDuration('');
    }
  };

  const changeDuration = (value: string) => {
    setDuration(value);
    const days = durationDays(value, unit);
    setDueDate(startDate && days ? addDays(startDate, days - 1) : '');
  };

  const changeDueDate = (value: string) => {
    setDueDate(value);
    if (!value || !startDate || value < startDate) {
      setDuration('');
      return;
    }
    setDuration(formatDuration(differenceInDays(value, startDate) + 1, unit));
  };

  const changeProjectUnit = (value: 'DAY' | 'WEEK') => {
    setProjectUnit(value);
    if (startDate && dueDate && dueDate >= startDate) {
      setDuration(formatDuration(differenceInDays(dueDate, startDate) + 1, value));
    }
  };

  const changeGoal = (value: string) => {
    const goal = goals.find((item) => item.id === value);
    setGoalId(value);
    setStartDate(goal && goal.startDate > today ? goal.startDate : today);
    setDueDate('');
    setDuration('');
  };

  const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const body = kind === 'AREA'
        ? { name: title, color }
        : kind === 'GOAL'
          ? { areaId, title, description, startDate, dueDate: dueDate || null, durationValue: duration ? Number(duration) : null }
          : { goalId, title, description, startDate, dueDate: dueDate || null, durationValue: duration ? Number(duration) : null, displayUnit: projectUnit };
      const response = await fetch(details.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || `无法${details.title}`);
      await onCreated();
      reset();
      onOpenChange(false);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : `无法${details.title}`);
    } finally {
      setSubmitting(false);
    }
  };

  const parentReady = kind === 'AREA' || (kind === 'GOAL' ? Boolean(areaId) : Boolean(goalId));
  const formId = `create-${kind.toLowerCase()}-form`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto p-5 sm:max-w-lg">
        <DialogHeader>
          <div className="mb-1 grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
            <Icon className="size-5" />
          </div>
          <DialogTitle className="text-lg">{details.title}</DialogTitle>
          <DialogDescription>{details.description}</DialogDescription>
        </DialogHeader>

        <form id={formId} className="space-y-5" onSubmit={submit}>
          <div className="space-y-2">
            <Label htmlFor={`${formId}-title`}>{details.nameLabel}</Label>
            <Input id={`${formId}-title`} value={title} onChange={(event) => setTitle(event.target.value)} placeholder={details.placeholder} maxLength={kind === 'AREA' ? 60 : 120} required />
          </div>

          {kind === 'AREA' ? (
            <div className="space-y-2">
              <Label htmlFor={`${formId}-color`}>标识颜色</Label>
              <div className="flex items-center gap-3">
                <Input id={`${formId}-color`} type="color" value={color} onChange={(event) => setColor(event.target.value)} className="h-11 w-16 cursor-pointer p-1" />
                <span className="text-sm text-muted-foreground">用于侧栏和总事项安排中的领域标记</span>
              </div>
            </div>
          ) : null}

          {kind === 'GOAL' ? (
            <div className="space-y-2">
              <Label htmlFor={`${formId}-area`}>所属领域</Label>
              <NativeSelect id={`${formId}-area`} className="w-full" value={areaId} onChange={(event) => setAreaId(event.target.value)} required>
                {areas.map((area) => <NativeSelectOption key={area.id} value={area.id}>{area.name}</NativeSelectOption>)}
              </NativeSelect>
            </div>
          ) : null}

          {kind === 'PROJECT' ? (
            <div className="space-y-2">
              <Label htmlFor={`${formId}-goal`}>所属目标</Label>
              <NativeSelect id={`${formId}-goal`} className="w-full" value={goalId} onChange={(event) => changeGoal(event.target.value)} required>
                {goals.map((goal) => <NativeSelectOption key={goal.id} value={goal.id}>{goal.title}</NativeSelectOption>)}
              </NativeSelect>
            </div>
          ) : null}

          {kind !== 'AREA' ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor={`${formId}-start`}>开始日期</Label>
                  <Input
                    id={`${formId}-start`}
                    type="date"
                    min={kind === 'PROJECT' ? selectedGoal?.startDate : undefined}
                    max={kind === 'PROJECT' ? selectedGoal?.ownDueDate ?? undefined : undefined}
                    value={startDate}
                    onChange={(event) => changeStartDate(event.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`${formId}-duration`}>预计时长</Label>
                  <div className="grid grid-cols-[1fr_92px] gap-2">
                    <Input id={`${formId}-duration`} type="number" min={kind === 'GOAL' || projectUnit === 'WEEK' ? 0.1 : 1} step={kind === 'GOAL' || projectUnit === 'WEEK' ? 0.1 : 1} value={duration} onChange={(event) => changeDuration(event.target.value)} placeholder="可选" />
                    {kind === 'GOAL' ? (
                      <div className="grid place-items-center rounded-lg border border-input bg-muted/35 text-sm">月</div>
                    ) : (
                      <NativeSelect aria-label="项目时长单位" value={projectUnit} onChange={(event) => changeProjectUnit(event.target.value as 'DAY' | 'WEEK')}>
                        <NativeSelectOption value="DAY">天</NativeSelectOption>
                        <NativeSelectOption value="WEEK">周</NativeSelectOption>
                      </NativeSelect>
                    )}
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor={`${formId}-due`}>截止日期</Label>
                <Input id={`${formId}-due`} type="date" min={startDate} max={kind === 'PROJECT' ? selectedGoal?.ownDueDate ?? undefined : undefined} value={dueDate} onChange={(event) => changeDueDate(event.target.value)} />
                <p className="text-xs leading-5 text-muted-foreground">填写时长会自动计算截止日期；也可以直接修改截止日期。不填写则不设置结束日期。</p>
                {duration && dueDate ? (
                  <p className="text-xs font-medium text-primary">共 {differenceInDays(dueDate, startDate) + 1} 个自然日，截止到 {dueDate}</p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor={`${formId}-description`}>备注</Label>
                <Textarea id={`${formId}-description`} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="可选" className="min-h-20 resize-none" />
              </div>
            </>
          ) : null}

          {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p> : null}
        </form>

        <DialogFooter className="-mx-5 -mb-5 px-5">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button type="submit" form={formId} disabled={submitting || !title.trim() || !parentReady}>
            {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
            {details.title}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
