import React from 'react';

export type AnalyticsTimeframe = 'week' | 'month' | 'year';

interface TimeframeSwitcherProps {
  value: AnalyticsTimeframe;
  onChange: (tf: AnalyticsTimeframe) => void;
  ariaLabel?: string;
}

const OPTIONS: Array<{ id: AnalyticsTimeframe; label: string }> = [
  { id: 'week', label: 'This Week' },
  { id: 'month', label: 'This Month' },
  { id: 'year', label: 'This Year' },
];

export const TimeframeSwitcher: React.FC<TimeframeSwitcherProps> = ({
  value,
  onChange,
  ariaLabel = 'Select timeframe',
}) => {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="inline-flex items-center self-start sm:self-auto gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-700/60"
    >
      {OPTIONS.map((opt) => {
        const active = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.id)}
            className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              active
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
};
