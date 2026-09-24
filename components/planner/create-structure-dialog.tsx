'use client';

import { useMemo, useState, type SyntheticEvent } from 'react';
import { Check, FolderKanban, Layers3, Loader2, Target } from 'lucide-react';
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
import { AREA_COLORS, suggestAreaColor } from '@/lib/area-colors';
import { addDays, differenceInDays, minDate } from '@/lib/date';
import type { AreaSummary, GoalSummary, ProjectSummary } from '@/lib/planner-types';

export type StructureKind = 'AREA' | 'GOAL' | 'PROJECT';

type Props = {
  kind: StructureKind;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  areas: AreaSummary[];
  goals: GoalSummary[];
  today: string;
  editing?: AreaSummary | GoalSummary | ProjectSummary;
  initialAreaId?: string;
  initialGoalId?: string;
  onCreated: () => Promise<void>;
};

const config = {
  AREA: {
    title: '新建领域',
    description: '领域用于归纳长期关注方向，不包含完成状态；设置截止日期后会约束所有下级事项。',
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
  editing,
  initialAreaId,
  initialGoalId,
  onCreated,
}: Props) {
  const details = config[kind];
  const Icon = details.icon;
  const editingGoal = kind === 'GOAL' ? editing as GoalSummary | undefined : undefined;
  const editingProject = kind === 'PROJECT' ? editing as ProjectSummary | undefined : undefined;
  const editingArea = kind === 'AREA' ? editing as AreaSummary | undefined : undefined;
  const [title, setTitle] = useState(editingArea?.name ?? editingGoal?.title ?? editingProject?.title ?? '');
  const [description, setDescription] = useState(editingGoal?.description ?? editingProject?.description ?? '');
  const [color, setColor] = useState(() => editingArea?.color ?? suggestAreaColor(areas.map((area) => area.color)));
  const [areaId, setAreaId] = useState(editingGoal?.areaId ?? initialAreaId ?? areas[0]?.id ?? '');
  const [goalId, setGoalId] = useState(editingProject?.goalId ?? initialGoalId ?? goals[0]?.id ?? '');
  const initialArea = areas.find((area) => area.id === (editingGoal?.areaId ?? initialAreaId ?? areas[0]?.id));
  const initialGoal = goals.find((goal) => goal.id === (editingProject?.goalId ?? initialGoalId ?? goals[0]?.id));
  const initialProjectArea = areas.find((area) => area.id === initialGoal?.areaId);
  const [startDate, setStartDate] = useState(
    editingArea?.startDate ?? editingGoal?.startDate ?? editingProject?.startDate
      ?? [today, kind === 'GOAL' ? initialArea?.startDate : kind === 'PROJECT' ? initialGoal?.startDate : null,
        kind === 'PROJECT' ? initialProjectArea?.startDate : null]
        .filter((date): date is string => Boolean(date)).sort().at(-1) ?? today,
  );
  const [dueDate, setDueDate] = useState(editingArea?.ownDueDate ?? editingGoal?.ownDueDate ?? editingProject?.ownDueDate ?? '');
  const [duration, setDuration] = useState(() => {
    const item = editingArea ?? editingGoal ?? editingProject;
    if (!item?.ownDueDate) return '';
    return 'durationValue' in item && item.durationValue != null ? String(item.durationValue) : formatDuration(differenceInDays(item.ownDueDate, item.startDate) + 1, kind === 'PROJECT' ? editingProject?.displayUnit ?? 'DAY' : 'MONTH');
  });
  const [projectUnit, setProjectUnit] = useState<'DAY' | 'WEEK'>(editingProject?.displayUnit ?? 'DAY');
  const [confirmUnboundedRecurrence, setConfirmUnboundedRecurrence] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const selectedGoal = useMemo(
    () => goals.find((goal) => goal.id === goalId) ?? null,
    [goalId, goals],
  );
  const selectedArea = areas.find((area) => area.id === (kind === 'PROJECT' ? selectedGoal?.areaId : areaId));
  const parentStart = kind === 'GOAL' ? selectedArea?.startDate : kind === 'PROJECT' ? [selectedArea?.startDate, selectedGoal?.startDate].filter((date): date is string => Boolean(date)).sort().at(-1) : undefined;
  const parentEnd = kind === 'GOAL' ? selectedArea?.ownDueDate : kind === 'PROJECT' ? minDate(selectedArea?.ownDueDate, selectedGoal?.ownDueDate) : null;
  const unit = kind === 'PROJECT' ? projectUnit : 'MONTH';

  const reset = () => {
    setTitle('');
    setDescription('');
    setColor(suggestAreaColor(areas.map((area) => area.color)));
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
    const area = areas.find((item) => item.id === goal?.areaId);
    setGoalId(value);
    setStartDate([today, goal?.startDate, area?.startDate].filter((date): date is string => Boolean(date)).sort().at(-1) ?? today);
    setDueDate('');
    setDuration('');
  };

  const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const body = kind === 'AREA'
        ? { name: title, color, startDate, dueDate: dueDate || null, confirmUnboundedRecurrence }
        : kind === 'GOAL'
          ? { areaId, title, description, startDate, dueDate: dueDate || null, durationValue: duration ? Number(duration) : null, confirmUnboundedRecurrence }
          : { goalId, title, description, startDate, dueDate: dueDate || null, durationValue: duration ? Number(duration) : null, displayUnit: projectUnit, confirmUnboundedRecurrence };
      const response = await fetch(editing ? `${details.endpoint}/${editing.id}` : details.endpoint, {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || `无法${editing ? '编辑' : '创建'}事项`);
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
  const formId = `${editing ? 'edit' : 'create'}-${kind.toLowerCase()}-form`;
  const actionTitle = editing ? `编辑${kind === 'AREA' ? '领域' : kind === 'GOAL' ? '目标' : '项目'}` : details.title;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto p-5 sm:max-w-lg">
        <DialogHeader>
          <div className="mb-1 grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
            <Icon className="size-5" />
          </div>
          <DialogTitle className="text-lg">{actionTitle}</DialogTitle>
          <DialogDescription>{details.description}</DialogDescription>
        </DialogHeader>

        <form id={formId} className="space-y-5" onSubmit={submit}>
          <div className="space-y-2">
            <Label htmlFor={`${formId}-title`}>{details.nameLabel}</Label>
            <Input id={`${formId}-title`} value={title} onChange={(event) => setTitle(event.target.value)} placeholder={details.placeholder} maxLength={kind === 'AREA' ? 60 : 120} required />
          </div>

          {kind === 'AREA' ? (
            <fieldset className="space-y-3">
              <legend className="text-sm font-medium">领域颜色</legend>
              <div className="grid grid-cols-5 gap-2">
                {AREA_COLORS.map((option) => {
                  const selected = color === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      aria-label={`选择${option.name}`}
                      aria-pressed={selected}
                      onClick={() => setColor(option.value)}
                      className={`flex min-h-[74px] flex-col items-center justify-center gap-1.5 rounded-xl border px-1 py-2 text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected ? 'border-primary bg-primary/5 text-foreground shadow-sm' : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:bg-muted/40'}`}
                    >
                      <span className="grid size-7 place-items-center rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,.07)]" style={{ backgroundColor: option.value }}>
                        {selected ? <Check className="size-3.5 text-white" strokeWidth={2.5} /> : null}
                      </span>
                      {option.name}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/25 px-3 py-2.5">
                <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{title.trim() || '领域名称'}</span>
                <span className="text-xs text-muted-foreground">预览</span>
              </div>
              <p className="text-xs text-muted-foreground">颜色会用于侧栏、任务标记和总事项安排。</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2"><Label htmlFor={`${formId}-start`}>开始日期</Label><Input id={`${formId}-start`} type="date" value={startDate} onChange={(event) => changeStartDate(event.target.value)} required /></div>
                <div className="space-y-2"><Label htmlFor={`${formId}-duration`}>预计时长（月）</Label><Input id={`${formId}-duration`} type="number" min={0.01} step={0.01} value={duration} onChange={(event) => changeDuration(event.target.value)} placeholder="可选" /></div>
              </div>
              <div className="space-y-2"><Label htmlFor={`${formId}-due`}>截止日期</Label><Input id={`${formId}-due`} type="date" min={startDate} value={dueDate} onChange={(event) => changeDueDate(event.target.value)} /><p className="text-xs text-muted-foreground">不填写则不设置时间边界；填写时长可自动计算截止日期。</p></div>
              {editingArea?.ownDueDate && !dueDate ? <label className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><input type="checkbox" checked={confirmUnboundedRecurrence} onChange={(event) => setConfirmUnboundedRecurrence(event.target.checked)} className="mt-1" /><span>我已了解：移除领域截止日期可能让下属循环任务变为无限循环。</span></label> : null}
            </fieldset>
          ) : null}

          {kind === 'GOAL' ? (
            <div className="space-y-2">
              <Label htmlFor={`${formId}-area`}>所属领域</Label>
              <NativeSelect id={`${formId}-area`} className="w-full" value={areaId} onChange={(event) => { const area = areas.find((item) => item.id === event.target.value); setAreaId(event.target.value); setStartDate(area?.startDate && area.startDate > today ? area.startDate : today); setDueDate(''); setDuration(''); }} required>
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
                    min={parentStart}
                    max={parentEnd ?? undefined}
                    value={startDate}
                    onChange={(event) => changeStartDate(event.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`${formId}-duration`}>预计时长</Label>
                  <div className="grid grid-cols-[1fr_92px] gap-2">
                    <Input id={`${formId}-duration`} type="number" min={kind === 'GOAL' || projectUnit === 'WEEK' ? 0.01 : 1} step={kind === 'GOAL' || projectUnit === 'WEEK' ? 0.01 : 1} value={duration} onChange={(event) => changeDuration(event.target.value)} placeholder="可选" />
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
                <Input id={`${formId}-due`} type="date" min={startDate} max={parentEnd ?? undefined} value={dueDate} onChange={(event) => changeDueDate(event.target.value)} />
                <p className="text-xs leading-5 text-muted-foreground">填写时长会自动计算截止日期；也可以直接修改截止日期。不填写则不设置结束日期。</p>
                {duration && dueDate ? (
                  <p className="text-xs font-medium text-primary">共 {differenceInDays(dueDate, startDate) + 1} 个自然日，截止到 {dueDate}</p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor={`${formId}-description`}>备注</Label>
                <Textarea id={`${formId}-description`} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="可选" className="min-h-20 resize-none" />
              </div>
              {editing && (editingGoal?.ownDueDate || editingProject?.ownDueDate) && !dueDate ? (
                <label className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  <input type="checkbox" checked={confirmUnboundedRecurrence} onChange={(event) => setConfirmUnboundedRecurrence(event.target.checked)} className="mt-1" />
                  <span>我已了解：移除上层截止日期可能让下属循环任务变为无限循环。</span>
                </label>
              ) : null}
            </>
          ) : null}

          {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p> : null}
        </form>

        <DialogFooter className="-mx-5 -mb-5 px-5">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button type="submit" form={formId} disabled={submitting || !title.trim() || !parentReady}>
            {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
            {editing ? '保存修改' : details.title}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
