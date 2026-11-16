import React, { useMemo, useState } from 'react';
import type { StudySession } from '../types';
import {
  addDays,
  formatDurationCompact,
  getWeekStart,
  toLocalDateKey,
} from '../utils/dateUtils';
import { TimeframeSwitcher, type AnalyticsTimeframe } from './TimeframeSwitcher';

type Timeframe = AnalyticsTimeframe;

interface FocusHoursChartProps {
  sessions: StudySession[];
}

interface ChartBarDatum {
  key: string;
  label: string;
  fullLabel: string;
  seconds: number;
  hours: number;
  sessionCount: number;
  dailyAvgHours?: number;
  isCurrent: boolean;
}

function formatHoursClean(hours: number): string {
  if (hours <= 0) return '0h';
  if (hours < 0.1) return `${hours.toFixed(2)}h`;
  return `${Number(hours.toFixed(1))}h`;
}

function getDaysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function getDaysInYear(year: number): number {
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return isLeap ? 366 : 365;
}

export const FocusHoursChart: React.FC<FocusHoursChartProps> = ({ sessions }) => {
  const [timeframe, setTimeframe] = useState<Timeframe>('week');
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const todayKey = toLocalDateKey(now);

  // Aggregate sessions by local date YYYY-MM-DD and by YYYY-MM
  const { byDate, byMonth } = useMemo(() => {
    const dateMap = new Map<string, { seconds: number; count: number }>();
    const monthMap = new Map<string, { seconds: number; count: number }>();

    for (const s of sessions) {
      const dt = new Date(s.startedAt);
      if (Number.isNaN(dt.getTime())) continue;
      const dateKey = toLocalDateKey(dt);
      const monthKey = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;

      const prevD = dateMap.get(dateKey) || { seconds: 0, count: 0 };
      dateMap.set(dateKey, {
        seconds: prevD.seconds + (s.durationSeconds || 0),
        count: prevD.count + 1,
      });

      const prevM = monthMap.get(monthKey) || { seconds: 0, count: 0 };
      monthMap.set(monthKey, {
        seconds: prevM.seconds + (s.durationSeconds || 0),
        count: prevM.count + 1,
      });
    }

    return { byDate: dateMap, byMonth: monthMap };
  }, [sessions]);

  const { bars, totalHours, dailyAvgHours, periodSubtitle } = useMemo(() => {
    const list: ChartBarDatum[] = [];

    if (timeframe === 'week') {
      const weekStart = getWeekStart(now);
      const weekEnd = addDays(weekStart, 6);
      for (let i = 0; i < 7; i++) {
        const d = addDays(weekStart, i);
        const key = toLocalDateKey(d);
        const entry = byDate.get(key) || { seconds: 0, count: 0 };
        const hours = entry.seconds / 3600;
        list.push({
          key,
          label: d.toLocaleDateString(undefined, { weekday: 'short' }),
          fullLabel: d.toLocaleDateString(undefined, {
            weekday: 'long',
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          }),
          seconds: entry.seconds,
          hours,
          sessionCount: entry.count,
          isCurrent: key === todayKey,
        });
      }
      const total = list.reduce((acc, b) => acc + b.hours, 0);
      return {
        bars: list,
        totalHours: total,
        dailyAvgHours: total / 7,
        periodSubtitle: `${weekStart.toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
        })} – ${weekEnd.toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })}`,
      };
    }

    if (timeframe === 'month') {
      const daysCount = getDaysInMonth(currentYear, currentMonth);
      for (let day = 1; day <= daysCount; day++) {
        const d = new Date(currentYear, currentMonth, day);
        const key = toLocalDateKey(d);
        const entry = byDate.get(key) || { seconds: 0, count: 0 };
        const hours = entry.seconds / 3600;
        list.push({
          key,
          label: String(day),
          fullLabel: d.toLocaleDateString(undefined, {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          }),
          seconds: entry.seconds,
          hours,
          sessionCount: entry.count,
          isCurrent: key === todayKey,
        });
      }
      const total = list.reduce((acc, b) => acc + b.hours, 0);
      return {
        bars: list,
        totalHours: total,
        dailyAvgHours: total / daysCount,
        periodSubtitle: now.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
      };
    }

    // timeframe === 'year'
    for (let m = 0; m < 12; m++) {
      const d = new Date(currentYear, m, 1);
      const monthKey = `${currentYear}-${String(m + 1).padStart(2, '0')}`;
      const entry = byMonth.get(monthKey) || { seconds: 0, count: 0 };
      const hours = entry.seconds / 3600;
      const dim = getDaysInMonth(currentYear, m);
      list.push({
        key: monthKey,
        label: d.toLocaleDateString(undefined, { month: 'short' }),
        fullLabel: d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
        seconds: entry.seconds,
        hours,
        sessionCount: entry.count,
        dailyAvgHours: hours / dim,
        isCurrent: m === currentMonth,
      });
    }
    const total = list.reduce((acc, b) => acc + b.hours, 0);
    return {
      bars: list,
      totalHours: total,
      dailyAvgHours: total / getDaysInYear(currentYear),
      periodSubtitle: String(currentYear),
    };
  }, [timeframe, byDate, byMonth, currentYear, currentMonth, todayKey, now]);

  const maxHours = useMemo(() => {
    const peak = Math.max(0, ...bars.map((b) => b.hours));
    if (peak <= 0) return 4;
    if (peak <= 2) return 2;
    if (peak <= 4) return 4;
    if (peak <= 8) return 8;
    return Math.ceil(peak * 1.15);
  }, [bars]);

  const yTicks = useMemo(() => {
    return [maxHours, maxHours * 0.5, 0];
  }, [maxHours]);

  const activeBar = activeIndex !== null ? bars[activeIndex] || null : null;

  return (
    <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 space-y-5">
      {/* Header & Timeframe Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Focus Hours
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {periodSubtitle} · Calculated from Pomodoro, Flowtime &amp; Block sessions
          </p>
        </div>

        <TimeframeSwitcher
          value={timeframe}
          onChange={(tf) => {
            setTimeframe(tf);
            setActiveIndex(null);
          }}
          ariaLabel="Focus hours timeframe"
        />
      </div>

      {/* Period Summary Strip + Active Hover/Tap Tooltip Readout */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-y border-slate-100 dark:border-slate-800 py-3">
        <div className="flex flex-wrap items-baseline gap-6">
          <div>
            <span className="text-xs text-slate-500 dark:text-slate-400">Total Focus</span>
            <div className="text-xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
              {formatHoursClean(totalHours)}
            </div>
          </div>
          <div>
            <span className="text-xs text-slate-500 dark:text-slate-400">Daily Average</span>
            <div className="text-xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
              {formatHoursClean(dailyAvgHours)}
              <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                {' '}
                / day
              </span>
            </div>
          </div>
        </div>

        {/* Live Contextual Bar Inspection Readout (great for both touch & desktop) */}
        <div className="min-h-[36px] flex items-center text-xs">
          {activeBar ? (
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 px-3 py-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
              <span className="font-medium text-slate-900 dark:text-slate-100">
                {activeBar.fullLabel}
              </span>
              <span aria-hidden="true" className="text-slate-400">
                ·
              </span>
              <span className="font-mono tabular-nums font-semibold text-blue-600 dark:text-blue-400">
                {formatHoursClean(activeBar.hours)} (
                {formatDurationCompact(Math.round(activeBar.seconds / 60))})
              </span>
              {activeBar.dailyAvgHours !== undefined && (
                <>
                  <span aria-hidden="true" className="text-slate-400">
                    ·
                  </span>
                  <span className="font-mono tabular-nums text-slate-600 dark:text-slate-300">
                    {formatHoursClean(activeBar.dailyAvgHours)}/day avg
                  </span>
                </>
              )}
              <span aria-hidden="true" className="text-slate-400">
                ·
              </span>
              <span className="text-slate-500 dark:text-slate-400 tabular-nums">
                {activeBar.sessionCount}{' '}
                {activeBar.sessionCount === 1 ? 'session' : 'sessions'}
              </span>
            </div>
          ) : (
            <span className="text-slate-400 dark:text-slate-500">
              Hover or tap any bar for exact hours
            </span>
          )}
        </div>
      </div>

      {/* Bar Chart Canvas */}
      <div className="relative flex gap-3">
        {/* Y-Axis Scale */}
        <div className="flex flex-col justify-between pb-7 pt-12 text-right text-[11px] font-mono tabular-nums text-slate-400 dark:text-slate-500 select-none shrink-0 w-9">
          {yTicks.map((tick, idx) => (
            <span key={idx}>{formatHoursClean(tick)}</span>
          ))}
        </div>

        {/* Scrollable Bars Area (scrolls horizontally on mobile for 28–31 day month view) */}
        <div
          className="flex-1 overflow-x-auto pb-1"
          onMouseLeave={() => setActiveIndex(null)}
        >
          <div
            className={`relative h-60 flex flex-col justify-end pt-12 ${
              timeframe === 'month' ? 'min-w-[660px] lg:min-w-0' : 'w-full'
            }`}
          >
            {/* Horizontal Reference Gridlines */}
            <div className="absolute inset-x-0 top-12 bottom-7 flex flex-col justify-between pointer-events-none">
              {yTicks.map((_, idx) => (
                <div
                  key={idx}
                  className="w-full border-b border-dashed border-slate-200/80 dark:border-slate-800"
                />
              ))}
            </div>

            {/* Bars Row */}
            <div
              className={`relative z-10 flex items-end h-full pb-7 ${
                timeframe === 'month' ? 'gap-1' : 'gap-2 sm:gap-3'
              }`}
            >
              {bars.map((bar, idx) => {
                const pct =
                  bar.seconds > 0
                    ? Math.max(4, Math.min(100, (bar.hours / maxHours) * 100))
                    : 0;
                const isActive = activeIndex === idx;

                return (
                  <button
                    key={bar.key}
                    type="button"
                    onMouseEnter={() => setActiveIndex(idx)}
                    onFocus={() => setActiveIndex(idx)}
                    onClick={() => setActiveIndex(isActive ? null : idx)}
                    className="group relative flex-1 h-full flex flex-col justify-end items-center focus:outline-none cursor-pointer"
                    aria-label={`${bar.fullLabel}: ${formatHoursClean(bar.hours)}`}
                  >
                    {/* Floating Tooltip on Hover/Tap */}
                    {isActive && (
                      <div
                        className={`pointer-events-none absolute -top-1 z-30 whitespace-nowrap rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-900 dark:bg-slate-800 px-2.5 py-1.5 text-[11px] text-white shadow-lg ${
                          idx <= 1
                            ? 'left-0'
                            : idx >= bars.length - 2
                            ? 'right-0'
                            : 'left-1/2 -translate-x-1/2'
                        }`}
                      >
                        <div className="font-medium">{bar.fullLabel}</div>
                        <div className="font-mono tabular-nums text-blue-300 mt-0.5">
                          {formatHoursClean(bar.hours)} ·{' '}
                          {formatDurationCompact(Math.round(bar.seconds / 60))}
                          {bar.dailyAvgHours !== undefined
                            ? ` · ${formatHoursClean(bar.dailyAvgHours)}/day`
                            : ''}
                        </div>
                      </div>
                    )}

                    {/* Value label above bars in Week & Year modes */}
                    {(timeframe === 'week' || timeframe === 'year') && bar.hours > 0 && (
                      <span
                        className={`mb-1 text-[10px] font-mono tabular-nums transition-colors ${
                          isActive
                            ? 'text-blue-600 dark:text-blue-400 font-semibold'
                            : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {formatHoursClean(bar.hours)}
                      </span>
                    )}

                    {/* Bar Column */}
                    <div
                      style={{ height: pct > 0 ? `${pct}%` : '2px' }}
                      className={`w-full rounded-t-md transition-all duration-200 ${
                        timeframe === 'week' ? 'max-w-[44px]' : 'max-w-[32px]'
                      } ${
                        bar.seconds === 0
                          ? 'bg-slate-200/80 dark:bg-slate-800'
                          : isActive
                          ? 'bg-blue-700 dark:bg-blue-400'
                          : bar.isCurrent
                          ? 'bg-blue-600 dark:bg-blue-500'
                          : 'bg-blue-500/80 dark:bg-blue-500/75 group-hover:bg-blue-600 dark:group-hover:bg-blue-400'
                      }`}
                    />

                    {/* X-Axis Label */}
                    <span
                      className={`absolute -bottom-6 text-[10px] sm:text-[11px] font-mono tabular-nums whitespace-nowrap ${
                        bar.isCurrent
                          ? 'text-blue-600 dark:text-blue-400 font-semibold'
                          : isActive
                          ? 'text-slate-900 dark:text-slate-100 font-medium'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {bar.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
