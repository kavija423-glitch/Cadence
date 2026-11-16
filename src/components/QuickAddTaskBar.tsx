import React, { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import type { Priority, Subject } from '../types';
import { parseQuickAddTask } from '../utils/quickAddParser';
import { formatDurationCompact, formatShortDate } from '../utils/dateUtils';

interface QuickAddTaskBarProps {
  subjects: Subject[];
  defaultSubjectId?: string;
  compact?: boolean;
  onCreateTask: (task: {
    title: string;
    subjectId: string;
    estimatedMinutes: number;
    priority: Priority;
    due?: string;
  }) => void;
}

export const QuickAddTaskBar: React.FC<QuickAddTaskBarProps> = ({
  subjects,
  defaultSubjectId,
  compact = false,
  onCreateTask,
}) => {
  const [input, setInput] = useState('');
  const fallbackId = defaultSubjectId || subjects[0]?.id || 'subj-general';

  const parsed = useMemo(
    () => parseQuickAddTask(input, subjects, fallbackId),
    [input, subjects, fallbackId]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!parsed.title) return;
    onCreateTask({
      title: parsed.title,
      subjectId: parsed.subjectId,
      estimatedMinutes: parsed.estimatedMinutes,
      priority: parsed.priority,
      due: parsed.due,
    });
    setInput('');
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-1.5">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder='Quick add: "Revise Past Paper #Physics 60m !high @today"'
          className={`flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 ${
            compact ? 'px-3 py-2 text-xs' : 'px-3.5 py-2.5 text-sm'
          }`}
        />
        <button
          type="submit"
          disabled={!parsed.title}
          className={`inline-flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            compact ? 'px-3 py-2 text-xs' : 'px-4 py-2.5 text-sm'
          }`}
        >
          <Plus className="w-4 h-4" />
          <span>Add</span>
        </button>
      </div>

      {input.trim().length > 0 && parsed.title && (
        <div className="flex flex-wrap items-center gap-2 px-1 text-xs text-slate-500 dark:text-slate-400">
          <span className="font-medium text-slate-700 dark:text-slate-300 truncate max-w-[240px]">
            {parsed.title}
          </span>
          <span aria-hidden="true">·</span>
          <span>{parsed.subjectName}</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono tabular-nums">
            {formatDurationCompact(parsed.estimatedMinutes)}
          </span>
          <span aria-hidden="true">·</span>
          <span
            className={
              parsed.priority === 'high'
                ? 'text-rose-600 dark:text-rose-400 font-medium'
                : parsed.priority === 'medium'
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-slate-500'
            }
          >
            {parsed.priority.charAt(0).toUpperCase() + parsed.priority.slice(1)} priority
          </span>
          {parsed.due && (
            <>
              <span aria-hidden="true">·</span>
              <span>Due {formatShortDate(parsed.due)}</span>
            </>
          )}
        </div>
      )}
    </form>
  );
};
