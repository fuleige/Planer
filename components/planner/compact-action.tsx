'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  children: ReactNode;
  icon: LucideIcon;
  tone?: 'neutral' | 'indigo';
};

export function CompactAction({ children, icon: Icon, tone = 'neutral', className = '', ...props }: Props) {
  return (
    <button
      type="button"
      className={`group/action inline-flex min-h-11 items-center justify-center rounded-full p-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...props}
    >
      <span className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors group-active/action:scale-[.98] ${tone === 'indigo'
        ? 'border-indigo-200 bg-indigo-50/70 text-indigo-700 group-hover/action:border-indigo-300 group-hover/action:bg-indigo-100'
        : 'border-slate-200 bg-slate-50/70 text-slate-600 group-hover/action:border-slate-300 group-hover/action:bg-slate-100'}`}>
        <Icon className="size-3.5 shrink-0" />
        {children}
      </span>
    </button>
  );
}
