import React, { useEffect, useState } from 'react';
import {
  Play,
  Pause,
  Square,
  RotateCcw,
  Maximize2,
  Minimize2,
  Volume2,
  VolumeX,
  Star,
  Coffee,
  X,
} from 'lucide-react';
import type {
  ActiveTimerSnapshot,
  Subject,
  TaskMetadata,
  TimerMode,
} from '../types';
import { formatDurationCompact, formatSecondsHMS } from '../utils/dateUtils';

export interface TimerControlsProps {
  timer: ActiveTimerSnapshot;
  elapsedMs: number;
  subjects: Subject[];
  tasks: Record<string, TaskMetadata>;
  soundEnabled: boolean;
  onToggleSound: () => void;
  onSelectMode: (mode: TimerMode) => void;
  onSelectContext: (params: { taskId?: string; subjectId: string; title: string }) => void;
  onStartOrResume: () => void;
  onPause: () => void;
  onReset: () => void;
  onOpenLogModal: () => void;
  onSwitchToBreak: () => void;
}

export const StudyTimerFocusView: React.FC<
  TimerControlsProps & {
    isFullscreenOverlay?: boolean;
    onCloseFullscreen?: () => void;
  }
> = ({
  timer,
  elapsedMs,
  subjects,
  tasks,
  soundEnabled,
  onToggleSound,
  onSelectMode,
  onSelectContext,
  onStartOrResume,
  onPause,
  onReset,
  onOpenLogModal,
  onSwitchToBreak,
  isFullscreenOverlay = false,
  onCloseFullscreen,
}) => {
  const activeTasks = Object.values(tasks).filter(
    (t) => !t.deleted && t.status === 'needsAction'
  );
  const currentSubject = subjects.find((s) => s.id === timer.subjectId) || subjects[0];

  const isFlowtime = timer.mode === 'flowtime';
  const remainingMs = isFlowtime
    ? elapsedMs
    : Math.max(0, timer.targetDurationMs - elapsedMs);

  const displaySeconds = isFlowtime
    ? Math.floor(elapsedMs / 1000)
    : Math.ceil(remainingMs / 1000);

  const progressRatio = isFlowtime
    ? ((elapsedMs / 1000) % 3600) / 3600
    : timer.targetDurationMs > 0
    ? Math.min(1, elapsedMs / timer.targetDurationMs)
    : 0;

  const radius = 112;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - progressRatio);

  const modes: Array<{ id: TimerMode; label: string; sub: string }> = [
    { id: 'pomodoro_25', label: 'Pomodoro 25/5', sub: '25m focus · 5m break' },
    { id: 'pomodoro_50', label: 'Pomodoro 50/10', sub: '50m focus · 10m break' },
    { id: 'flowtime', label: 'Flowtime', sub: 'Count-up stopwatch' },
    { id: 'block', label: 'Block Countdown', sub: 'Scheduled block timer' },
  ];

  return (
    <div
      className={`${
        isFullscreenOverlay
          ? 'fixed inset-0 z-50 bg-slate-50 dark:bg-slate-950 overflow-y-auto'
          : 'mx-auto max-w-3xl px-4 sm:px-6 py-8'
      }`}
    >
      <div className="mx-auto max-w-2xl px-4 py-6 sm:py-8 space-y-8">
        {/* Top Controls Row */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              {timer.phase === 'break' ? 'Rest & Recovery' : 'Focus Session'}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Timestamp-accurate <code className="font-mono">Date.now()</code> clock · Survives screen lock & background tabs
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onToggleSound}
              className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              title={soundEnabled ? 'Mute completion chime' : 'Enable completion chime'}
              aria-label="Toggle chime sound"
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>

            {isFullscreenOverlay && onCloseFullscreen && (
              <button
                type="button"
                onClick={onCloseFullscreen}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <Minimize2 className="w-4 h-4" />
                <span>Exit Focus</span>
              </button>
            )}
          </div>
        </div>

        {/* Mode Switcher */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {modes.map((m) => {
            const active = timer.mode === m.id;
            return (
              <button
                key={m.id}
                type="button"
                disabled={timer.status === 'running'}
                onClick={() => onSelectMode(m.id)}
                className={`rounded-xl border p-3 text-left transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
                  active
                    ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-950/40 text-slate-900 dark:text-slate-100'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <div className="text-xs font-semibold whitespace-nowrap">{m.label}</div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                  {m.sub}
                </div>
              </button>
            );
          })}
        </div>

        {/* Central Dial */}
        <div className="flex flex-col items-center justify-center rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 py-10 px-6">
          <div className="relative flex items-center justify-center w-64 h-64">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 256 256">
              <circle
                cx="128"
                cy="128"
                r={radius}
                fill="none"
                stroke="currentColor"
                strokeWidth="8"
                className="text-slate-100 dark:text-slate-800"
              />
              <circle
                cx="128"
                cy="128"
                r={radius}
                fill="none"
                stroke={timer.phase === 'break' ? '#059669' : currentSubject?.color || '#2563EB'}
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                className="transition-[stroke-dashoffset] duration-300 ease-linear"
              />
            </svg>

            <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {timer.phase === 'break'
                  ? 'Break Time'
                  : isFlowtime
                  ? 'Elapsed'
                  : 'Remaining'}
              </span>
              <div className="mt-1 text-5xl font-mono font-semibold tracking-tight tabular-nums text-slate-900 dark:text-slate-100">
                {formatSecondsHMS(displaySeconds)}
              </div>
              <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 max-w-[190px]">
                <span
                  className="w-2 h-2 rounded-xs shrink-0"
                  style={{ backgroundColor: currentSubject?.color || '#2563EB' }}
                />
                <span className="truncate">{timer.title}</span>
              </div>
            </div>
          </div>

          {/* Primary Timer Actions */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            {timer.status === 'running' ? (
              <button
                type="button"
                onClick={onPause}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 dark:bg-slate-100 px-6 py-3 text-sm font-semibold text-white dark:text-slate-900 hover:opacity-90 transition-opacity cursor-pointer"
              >
                <Pause className="w-4 h-4" />
                <span>Pause</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onStartOrResume}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 px-6 py-3 text-sm font-semibold text-white transition-colors cursor-pointer"
              >
                <Play className="w-4 h-4" />
                <span>{elapsedMs > 0 ? 'Resume' : 'Start Focus'}</span>
              </button>
            )}

            {(elapsedMs >= 10_000 || timer.status !== 'idle') && timer.phase === 'focus' && (
              <button
                type="button"
                onClick={onOpenLogModal}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 text-sm font-medium text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer"
              >
                <Square className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>Finish & Log</span>
              </button>
            )}

            {(timer.mode === 'pomodoro_25' || timer.mode === 'pomodoro_50') &&
              timer.phase === 'focus' &&
              timer.status === 'idle' && (
                <button
                  type="button"
                  onClick={onSwitchToBreak}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <Coffee className="w-4 h-4" />
                  <span>Take Break</span>
                </button>
              )}

            {elapsedMs > 0 && (
              <button
                type="button"
                onClick={onReset}
                className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                title="Reset timer"
                aria-label="Reset timer"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Context Selector: Link to Task or Subject */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
          <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            Session Target
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">Link Active Task</label>
              <select
                value={timer.taskId || ''}
                onChange={(e) => {
                  const taskId = e.target.value;
                  if (!taskId) {
                    const subj = subjects.find((s) => s.id === timer.subjectId) || subjects[0];
                    onSelectContext({
                      taskId: undefined,
                      subjectId: subj?.id || '',
                      title: subj ? `${subj.name} Deep Focus` : 'Focus Session',
                    });
                    return;
                  }
                  const t = tasks[taskId];
                  if (t) {
                    onSelectContext({
                      taskId: t.google_task_id,
                      subjectId: t.subjectId,
                      title: t.title,
                    });
                  }
                }}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
              >
                <option value="">Free Study (No specific task)</option>
                {activeTasks.map((t) => (
                  <option key={t.google_task_id} value={t.google_task_id}>
                    {t.title} ({formatDurationCompact(t.estimated_minutes)})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] text-slate-500 mb-1">Subject</label>
              <select
                value={timer.subjectId}
                onChange={(e) => {
                  const subj = subjects.find((s) => s.id === e.target.value);
                  onSelectContext({
                    taskId: timer.taskId,
                    subjectId: e.target.value,
                    title: timer.taskId
                      ? timer.title
                      : subj
                      ? `${subj.name} Deep Focus`
                      : 'Focus Session',
                  });
                }}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
              >
                <option value="">No Subject</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const StudyTimerDockedBar: React.FC<{
  timer: ActiveTimerSnapshot;
  elapsedMs: number;
  subjects: Subject[];
  onStartOrResume: () => void;
  onPause: () => void;
  onOpenLogModal: () => void;
  onExpandFocus: () => void;
  hideOnMobile?: boolean;
}> = ({
  timer,
  elapsedMs,
  subjects,
  onStartOrResume,
  onPause,
  onOpenLogModal,
  onExpandFocus,
  hideOnMobile = false,
}) => {
  const subj = subjects.find((s) => s.id === timer.subjectId);
  const isFlowtime = timer.mode === 'flowtime';
  const remainingMs = isFlowtime
    ? elapsedMs
    : Math.max(0, timer.targetDurationMs - elapsedMs);
  const displaySeconds = isFlowtime
    ? Math.floor(elapsedMs / 1000)
    : Math.ceil(remainingMs / 1000);

  const isActive = timer.status !== 'idle' || elapsedMs > 0;

  return (
    <div
      className={`${
        hideOnMobile ? 'hidden md:flex' : 'flex'
      } fixed bottom-16 md:bottom-0 left-0 right-0 z-30 h-12 md:h-13 items-center justify-between gap-3 border-t border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md px-4 sm:px-6`}
    >
      {/* Left: Task & Subject */}
      <button
        type="button"
        onClick={onExpandFocus}
        className="flex items-center gap-2.5 min-w-0 text-left cursor-pointer group"
      >
        <span
          className="w-2.5 h-2.5 rounded-xs shrink-0"
          style={{ backgroundColor: subj?.color || '#2563EB' }}
        />
        <span className="text-xs sm:text-sm font-medium text-slate-900 dark:text-slate-100 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
          {timer.title}
        </span>
        <span className="hidden sm:inline text-xs text-slate-400 shrink-0">
          · {subj?.name || 'No Subject'}
        </span>
      </button>

      {/* Right: Clock + Controls */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        <span className="font-mono text-sm sm:text-base font-semibold tabular-nums text-slate-900 dark:text-slate-100">
          {formatSecondsHMS(displaySeconds)}
        </span>

        {timer.status === 'running' ? (
          <button
            type="button"
            onClick={onPause}
            className="inline-flex items-center gap-1 rounded-lg bg-slate-900 dark:bg-slate-100 px-3 py-1.5 text-xs font-medium text-white dark:text-slate-900 cursor-pointer"
            aria-label="Pause timer"
          >
            <Pause className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Pause</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={onStartOrResume}
            className="inline-flex items-center gap-1 rounded-lg bg-blue-600 hover:bg-blue-700 px-3 py-1.5 text-xs font-medium text-white cursor-pointer"
            aria-label="Start timer"
          >
            <Play className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{isActive ? 'Resume' : 'Start'}</span>
          </button>
        )}

        {isActive && timer.phase === 'focus' && (
          <button
            type="button"
            onClick={onOpenLogModal}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            title="Stop and log session"
          >
            <Square className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
            <span className="hidden sm:inline">Log</span>
          </button>
        )}

        <button
          type="button"
          onClick={onExpandFocus}
          className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          title="Focus Mode"
          aria-label="Open distraction-free Focus Mode"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export const SessionCompleteModal: React.FC<{
  isOpen: boolean;
  title: string;
  subjectName: string;
  durationSeconds: number;
  hasLinkedTarget?: boolean;
  defaultMarkCompleted?: boolean;
  onSave: (rating: 1 | 2 | 3 | 4 | 5, notes: string, markCompleted: boolean) => void;
  onDiscard: () => void;
  onCancel: () => void;
}> = ({
  isOpen,
  title,
  subjectName,
  durationSeconds,
  hasLinkedTarget = false,
  defaultMarkCompleted = false,
  onSave,
  onDiscard,
  onCancel,
}) => {
  const [rating, setRating] = useState<1 | 2 | 3 | 4 | 5>(4);
  const [notes, setNotes] = useState('');
  const [markCompleted, setMarkCompleted] = useState(defaultMarkCompleted);

  useEffect(() => {
    if (isOpen) {
      setMarkCompleted(defaultMarkCompleted);
    }
  }, [isOpen, defaultMarkCompleted]);

  if (!isOpen) return null;

  const mins = Math.round(durationSeconds / 60);
  const minsLabel = durationSeconds < 60 ? '< 1 min' : `${mins} min`;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-xs p-0 sm:p-4">
      <div className="w-full max-w-md rounded-t-3xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Log Study Session
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {title} · {subjectName} ·{' '}
              <span className="font-mono tabular-nums font-medium text-blue-600 dark:text-blue-400">
                {minsLabel} ({formatSecondsHMS(durationSeconds)})
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-2">
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
            Focus Quality Rating (1–5)
          </label>
          <div className="grid grid-cols-5 gap-2">
            {([1, 2, 3, 4, 5] as const).map((val) => {
              const selected = rating === val;
              return (
                <button
                  key={val}
                  type="button"
                  onClick={() => setRating(val)}
                  className={`flex flex-col items-center justify-center rounded-xl border py-2.5 text-xs font-mono font-semibold transition-colors cursor-pointer ${
                    selected
                      ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <Star
                    className={`w-4 h-4 mb-1 ${
                      val <= rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300 dark:text-slate-600'
                    }`}
                  />
                  <span>{val}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
            Session Notes (Optional)
          </label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Key takeaways or next step..."
            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
          />
        </div>

        {hasLinkedTarget && (
          <label className="flex items-center gap-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 px-3 py-2.5 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={markCompleted}
              onChange={(e) => setMarkCompleted(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-600"
            />
            <span>Mark linked task &amp; block as completed</span>
          </label>
        )}

        <div className="flex items-center justify-between gap-2 pt-1">
          <button
            type="button"
            onClick={onDiscard}
            className="text-xs font-medium text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 px-2 py-2 cursor-pointer"
          >
            Discard
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
            >
              Keep Running
            </button>
            <button
              type="button"
              onClick={() => {
                onSave(rating, notes.trim(), markCompleted);
                setNotes('');
              }}
              className="rounded-xl bg-blue-600 hover:bg-blue-700 px-4 py-2 text-xs font-semibold text-white cursor-pointer"
            >
              Save Session
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
