import React, { useMemo, useState } from 'react';
import { Flame, Clock, Star, Target } from 'lucide-react';
import type {
  CalendarBlock,
  StudySession,
  Subject,
  TaskMetadata,
} from '../types';
import {
  addDays,
  formatDurationCompact,
  formatShortDate,
  getWeekStart,
  toLocalDateKey,
} from '../utils/dateUtils';
import { FocusHoursChart } from './FocusHoursChart';
import { TimeframeSwitcher, type AnalyticsTimeframe } from './TimeframeSwitcher';

interface AnalyticsDashboardProps {
  subjects: Subject[];
  tasks: Record<string, TaskMetadata>;
  blocks: CalendarBlock[];
  sessions: StudySession[];
  dailyGoalMinutes: number;
}

function getPeriodBounds(timeframe: AnalyticsTimeframe, refDate: Date): {
  startKey: string;
  endKey: string;
  subtitle: string;
} {
  const year = refDate.getFullYear();
  const month = refDate.getMonth();

  if (timeframe === 'week') {
    const start = getWeekStart(refDate);
    const end = addDays(start, 6);
    return {
      startKey: toLocalDateKey(start),
      endKey: toLocalDateKey(end),
      subtitle: `${start.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      })} – ${end.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      })}`,
    };
  }

  if (timeframe === 'month') {
    const lastDay = new Date(year, month + 1, 0).getDate();
    const start = new Date(year, month, 1);
    const end = new Date(year, month, lastDay);
    return {
      startKey: toLocalDateKey(start),
      endKey: toLocalDateKey(end),
      subtitle: refDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
    };
  }

  return {
    startKey: `${year}-01-01`,
    endKey: `${year}-12-31`,
    subtitle: String(year),
  };
}

export const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({
  subjects,
  tasks,
  blocks,
  sessions,
  dailyGoalMinutes,
}) => {
  const [hoveredSubjectId, setHoveredSubjectId] = useState<string | null>(null);
  const [plannedVsActualTimeframe, setPlannedVsActualTimeframe] =
    useState<AnalyticsTimeframe>('week');
  const [distributionTimeframe, setDistributionTimeframe] =
    useState<AnalyticsTimeframe>('week');

  const today = new Date();
  const todayKey = toLocalDateKey(today);
  const weekStartKey = toLocalDateKey(getWeekStart(today));
  const weekEndKey = toLocalDateKey(addDays(getWeekStart(today), 6));

  // Map daily totals (YYYY-MM-DD -> minutes)
  const dailyMinutesMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const sess of sessions) {
      const key = toLocalDateKey(new Date(sess.startedAt));
      map.set(key, (map.get(key) || 0) + sess.durationSeconds / 60);
    }
    return map;
  }, [sessions]);

  // Calculate current and best streaks
  const { currentStreak, bestStreak } = useMemo(() => {
    let cur = 0;
    let cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    // If today has 0 mins yet, check from yesterday so active morning doesn't break streak
    if ((dailyMinutesMap.get(toLocalDateKey(cursor)) || 0) < 5) {
      cursor = addDays(cursor, -1);
    }
    while ((dailyMinutesMap.get(toLocalDateKey(cursor)) || 0) >= 5) {
      cur += 1;
      cursor = addDays(cursor, -1);
    }

    // Best streak across last 90 days
    let best = cur;
    let run = 0;
    for (let i = 90; i >= 0; i--) {
      const k = toLocalDateKey(addDays(today, -i));
      if ((dailyMinutesMap.get(k) || 0) >= 5) {
        run += 1;
        if (run > best) best = run;
      } else {
        run = 0;
      }
    }
    return { currentStreak: cur, bestStreak: best };
  }, [dailyMinutesMap, today]);

  const thisWeekMinutes = useMemo(() => {
    let sum = 0;
    for (const sess of sessions) {
      const k = toLocalDateKey(new Date(sess.startedAt));
      if (k >= weekStartKey && k <= weekEndKey) {
        sum += sess.durationSeconds / 60;
      }
    }
    return Math.round(sum);
  }, [sessions, weekStartKey, weekEndKey]);

  const todayMinutes = Math.round(dailyMinutesMap.get(todayKey) || 0);
  const goalPct = Math.min(100, Math.round((todayMinutes / Math.max(1, dailyGoalMinutes)) * 100));

  const avgFocus = useMemo(() => {
    if (sessions.length === 0) return null;
    const total = sessions.reduce((acc, s) => acc + s.focusRating, 0);
    return (total / sessions.length).toFixed(1);
  }, [sessions]);

  // Helper: compute Planned vs Actual hours per Subject for a given timeframe
  const computeSubjectStats = useMemo(() => {
    return (tf: AnalyticsTimeframe) => {
      const { startKey, endKey, subtitle } = getPeriodBounds(tf, today);
      const plannedMap = new Map<string, number>();
      const actualMap = new Map<string, number>();

      // Planned = scheduled calendar blocks in period + unscheduled tasks due in period
      const accountedTaskIds = new Set<string>();
      for (const b of blocks) {
        if (b.deleted) continue;
        if (b.date >= startKey && b.date <= endKey) {
          plannedMap.set(b.subjectId, (plannedMap.get(b.subjectId) || 0) + b.durationMinutes);
          if (b.taskId) accountedTaskIds.add(b.taskId);
        }
      }
      for (const t of Object.values(tasks)) {
        if (t.deleted || accountedTaskIds.has(t.google_task_id)) continue;
        if (t.due && t.due >= startKey && t.due <= endKey) {
          plannedMap.set(t.subjectId, (plannedMap.get(t.subjectId) || 0) + t.estimated_minutes);
        }
      }

      for (const s of sessions) {
        const dt = new Date(s.startedAt);
        if (Number.isNaN(dt.getTime())) continue;
        const k = toLocalDateKey(dt);
        if (k >= startKey && k <= endKey) {
          actualMap.set(s.subjectId, (actualMap.get(s.subjectId) || 0) + s.durationSeconds / 60);
        }
      }

      const rows = subjects.map((subj) => {
        const plannedHours = Number(((plannedMap.get(subj.id) || 0) / 60).toFixed(2));
        const actualHours = Number(((actualMap.get(subj.id) || 0) / 60).toFixed(2));
        return {
          subject: subj,
          plannedHours,
          actualHours,
        };
      });

      return { rows, subtitle };
    };
  }, [subjects, blocks, tasks, sessions, today]);

  const plannedVsActual = useMemo(
    () => computeSubjectStats(plannedVsActualTimeframe),
    [computeSubjectStats, plannedVsActualTimeframe]
  );

  const distribution = useMemo(
    () => computeSubjectStats(distributionTimeframe),
    [computeSubjectStats, distributionTimeframe]
  );

  const maxBarHours = useMemo(() => {
    const peak = Math.max(
      1,
      ...plannedVsActual.rows.flatMap((s) => [s.plannedHours, s.actualHours])
    );
    return Math.ceil(peak);
  }, [plannedVsActual.rows]);

  const totalActualHours = useMemo(
    () => distribution.rows.reduce((acc, r) => acc + r.actualHours, 0),
    [distribution.rows]
  );

  // Donut segments
  const donutSegments = useMemo(() => {
    const r = 64;
    const c = 2 * Math.PI * r;
    let offset = 0;
    return distribution.rows
      .filter((s) => s.actualHours > 0)
      .map((s) => {
        const ratio = totalActualHours > 0 ? s.actualHours / totalActualHours : 0;
        const dash = ratio * c;
        const seg = {
          ...s,
          ratio,
          dashArray: `${dash} ${c - dash}`,
          dashOffset: -offset,
        };
        offset += dash;
        return seg;
      });
  }, [distribution.rows, totalActualHours]);

  // 28-day activity matrix
  const last28Days = useMemo(() => {
    return Array.from({ length: 28 }, (_, i) => {
      const d = addDays(today, -(27 - i));
      const key = toLocalDateKey(d);
      const mins = Math.round(dailyMinutesMap.get(key) || 0);
      return { date: d, key, mins };
    });
  }, [today, dailyMinutesMap]);

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-6 space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          Study Analytics
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Planned vs. actual study hours, subject balance, and daily consistency
        </p>
      </div>

      {/* 4-Column KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>This Week</span>
            <Clock className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="mt-2 text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {formatDurationCompact(thisWeekMinutes)}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {formatDurationCompact(todayMinutes)} logged today
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Study Streak</span>
            <Flame className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="mt-2 text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {currentStreak} {currentStreak === 1 ? 'day' : 'days'}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            Best streak: {bestStreak} days
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Avg Focus Rating</span>
            <Star className="w-4 h-4 text-amber-500" />
          </div>
          <div className="mt-2 text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {avgFocus ? `${avgFocus} / 5.0` : '—'}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            Across {sessions.length} logged sessions
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Daily Goal</span>
            <Target className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="mt-2 text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {goalPct}%
          </div>
          <div className="mt-2 h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-600 dark:bg-emerald-500 transition-all"
              style={{ width: `${goalPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Focus Hours Bar Chart with Week / Month / Year Switcher */}
      <FocusHoursChart sessions={sessions} />

      {/* Charts Row: Planned vs Actual + Subject Distribution Donut */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Planned vs Actual Bar Chart */}
        <div className="lg:col-span-7 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Planned vs. Actual Hours
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {plannedVsActual.subtitle} · Scheduled &amp; due workload vs. logged focus time
                </p>
              </div>
              <TimeframeSwitcher
                value={plannedVsActualTimeframe}
                onChange={setPlannedVsActualTimeframe}
                ariaLabel="Planned vs actual timeframe"
              />
            </div>
            <div className="flex items-center gap-4 text-xs text-slate-600 dark:text-slate-300">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-slate-300 dark:bg-slate-600" />
                Planned
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-blue-600 dark:bg-blue-500" />
                Actual
              </span>
            </div>
          </div>

          {plannedVsActual.rows.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">
              Add subjects and study sessions to see Planned vs. Actual comparisons.
            </div>
          ) : (
            <div className="space-y-4">
              {plannedVsActual.rows.map((row) => {
                const plannedPct = Math.min(100, (row.plannedHours / maxBarHours) * 100);
                const actualPct = Math.min(100, (row.actualHours / maxBarHours) * 100);
                return (
                  <div key={row.subject.id} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 font-medium text-slate-800 dark:text-slate-200">
                        <span
                          className="w-2.5 h-2.5 rounded-xs shrink-0"
                          style={{ backgroundColor: row.subject.color }}
                        />
                        <span>{row.subject.name}</span>
                      </div>
                      <div className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                        <span className="text-slate-900 dark:text-slate-100 font-medium">
                          {row.actualHours.toFixed(1)}h
                        </span>{' '}
                        / {row.plannedHours.toFixed(1)}h planned
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="h-2.5 w-full rounded-md bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <div
                          className="h-full rounded-md bg-slate-300 dark:bg-slate-600 transition-all duration-300"
                          style={{ width: `${plannedPct}%` }}
                        />
                      </div>
                      <div className="h-2.5 w-full rounded-md bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <div
                          className="h-full rounded-md transition-all duration-300"
                          style={{
                            width: `${actualPct}%`,
                            backgroundColor: row.subject.color,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Subject Distribution Donut Chart */}
        <div className="lg:col-span-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5">
          <div className="flex flex-col gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Subject Distribution
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {distribution.subtitle} · Share of logged study time by subject
              </p>
            </div>
            <TimeframeSwitcher
              value={distributionTimeframe}
              onChange={(tf) => {
                setDistributionTimeframe(tf);
                setHoveredSubjectId(null);
              }}
              ariaLabel="Subject distribution timeframe"
            />
          </div>

          {totalActualHours <= 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">
              No study sessions logged for {distribution.subtitle}.
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row lg:flex-col xl:flex-row items-center gap-6">
              <div className="relative w-44 h-44 shrink-0">
                <svg viewBox="0 0 160 160" className="w-full h-full -rotate-90">
                  <circle
                    cx="80"
                    cy="80"
                    r="64"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="22"
                    className="text-slate-100 dark:text-slate-800"
                  />
                  {donutSegments.map((seg) => (
                    <circle
                      key={seg.subject.id}
                      cx="80"
                      cy="80"
                      r="64"
                      fill="none"
                      stroke={seg.subject.color}
                      strokeWidth={hoveredSubjectId === seg.subject.id ? 26 : 22}
                      strokeDasharray={seg.dashArray}
                      strokeDashoffset={seg.dashOffset}
                      onMouseEnter={() => setHoveredSubjectId(seg.subject.id)}
                      onMouseLeave={() => setHoveredSubjectId(null)}
                      className="transition-all duration-200 cursor-pointer"
                    />
                  ))}
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
                  <span className="text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                    {totalActualHours.toFixed(1)}h
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    Total logged
                  </span>
                </div>
              </div>

              <div className="flex-1 w-full space-y-2.5">
                {donutSegments.map((seg) => (
                  <div
                    key={seg.subject.id}
                    onMouseEnter={() => setHoveredSubjectId(seg.subject.id)}
                    onMouseLeave={() => setHoveredSubjectId(null)}
                    className={`flex items-center justify-between text-xs rounded-lg px-2 py-1 transition-colors ${
                      hoveredSubjectId === seg.subject.id
                        ? 'bg-slate-100 dark:bg-slate-800'
                        : ''
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-xs shrink-0"
                        style={{ backgroundColor: seg.subject.color }}
                      />
                      <span className="font-medium text-slate-800 dark:text-slate-200 truncate">
                        {seg.subject.name}
                      </span>
                    </div>
                    <div className="font-mono tabular-nums text-slate-600 dark:text-slate-400 shrink-0 ml-2">
                      {seg.actualHours.toFixed(1)}h · {Math.round(seg.ratio * 100)}%
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 28-Day Streak Matrix & Recent Sessions */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                28-Day Cadence
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Daily minutes studied over the last 4 weeks
              </p>
            </div>
            <span className="text-xs font-mono tabular-nums text-slate-500">
              Goal {formatDurationCompact(dailyGoalMinutes)}/d
            </span>
          </div>

          <div className="grid grid-cols-7 gap-2">
            {last28Days.map((day) => {
              const intensity =
                day.mins === 0
                  ? 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                  : day.mins < dailyGoalMinutes * 0.4
                  ? 'bg-blue-100 dark:bg-blue-950/70 text-blue-800 dark:text-blue-200'
                  : day.mins < dailyGoalMinutes * 0.85
                  ? 'bg-blue-300 dark:bg-blue-800 text-blue-950 dark:text-blue-100'
                  : 'bg-blue-600 dark:bg-blue-500 text-white';

              return (
                <div
                  key={day.key}
                  title={`${formatShortDate(day.key)}: ${day.mins} min`}
                  className={`aspect-square rounded-lg flex flex-col items-center justify-center text-[10px] font-mono tabular-nums ${intensity} ${
                    day.key === todayKey ? 'ring-2 ring-slate-900 dark:ring-slate-100' : ''
                  }`}
                >
                  <span>{day.date.getDate()}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="lg:col-span-7 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Recent Focus Sessions
          </h2>

          {sessions.length === 0 ? (
            <p className="text-xs text-slate-500 py-8 text-center">
              No completed study sessions yet.
            </p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {sessions.slice(0, 6).map((s) => {
                const subj = subjects.find((x) => x.id === s.subjectId);
                return (
                  <div
                    key={s.id}
                    className="py-2.5 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-xs shrink-0"
                        style={{ backgroundColor: subj?.color || '#64748b' }}
                      />
                      <div className="min-w-0">
                        <div className="font-medium text-slate-900 dark:text-slate-100 truncate">
                          {s.title}
                        </div>
                        <div className="text-slate-500 dark:text-slate-400">
                          {subj?.name || 'No Subject'} ·{' '}
                          {new Date(s.startedAt).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0 font-mono tabular-nums">
                      <span className="text-slate-700 dark:text-slate-300 font-medium">
                        {formatDurationCompact(Math.round(s.durationSeconds / 60))}
                      </span>
                      <span className="inline-flex items-center gap-0.5 text-amber-500">
                        <Star className="w-3 h-3 fill-amber-400" />
                        {s.focusRating}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
