import React, { useMemo, useState } from 'react';
import {
  Check,
  Play,
  CalendarPlus,
  Pencil,
  Trash2,
  Search,
  X,
  Plus,
  Repeat,
} from 'lucide-react';
import type {
  CalendarBlock,
  Priority,
  RepeatRule,
  RepeatType,
  Subject,
  TaskFilter,
  TaskMetadata,
} from '../types';
import {
  addDays,
  formatDurationCompact,
  formatShortDate,
  toLocalDateKey,
} from '../utils/dateUtils';
import { formatRepeatLabel, normalizeRepeatRule } from '../utils/recurrence';
import { QuickAddTaskBar } from './QuickAddTaskBar';

const WEEKDAY_BUTTONS: Array<{ day: number; label: string }> = [
  { day: 1, label: 'Mon' },
  { day: 2, label: 'Tue' },
  { day: 3, label: 'Wed' },
  { day: 4, label: 'Thu' },
  { day: 5, label: 'Fri' },
  { day: 6, label: 'Sat' },
  { day: 0, label: 'Sun' },
];

interface TaskFormState {
  mode: 'create' | 'edit';
  taskId?: string;
  title: string;
  subjectId: string;
  priority: Priority;
  estimated_minutes: number;
  due: string;
  notes: string;
  repeat: RepeatRule;
}

interface TaskManagerViewProps {
  subjects: Subject[];
  tasks: Record<string, TaskMetadata>;
  calendarBlocks: CalendarBlock[];
  onCreateTask: (input: {
    title: string;
    subjectId: string;
    estimatedMinutes: number;
    priority: Priority;
    due?: string;
    notes?: string;
    repeat?: RepeatRule;
  }) => void;
  onUpdateTask: (taskId: string, patch: Partial<TaskMetadata>) => void;
  onDeleteTask: (taskId: string) => void;
  onStartTimerForTask: (task: TaskMetadata) => void;
  onScheduleTask: (task: TaskMetadata, date: string, startMinutes: number, durationMinutes: number) => void;
  isGoogleConnected: boolean;
}

export const TaskManagerView: React.FC<TaskManagerViewProps> = ({
  subjects,
  tasks,
  calendarBlocks,
  onCreateTask,
  onUpdateTask,
  onDeleteTask,
  onStartTimerForTask,
  onScheduleTask,
  isGoogleConnected,
}) => {
  const [filter, setFilter] = useState<TaskFilter>('today');
  const [subjectFilter, setSubjectFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [taskForm, setTaskForm] = useState<TaskFormState | null>(null);
  const [schedulingTask, setSchedulingTask] = useState<TaskMetadata | null>(null);
  const [confirmDeleteTask, setConfirmDeleteTask] = useState<TaskMetadata | null>(null);

  // Schedule modal state
  const [schedDate, setSchedDate] = useState(() => toLocalDateKey(new Date()));
  const [schedTime, setSchedTime] = useState('14:00');
  const [schedDuration, setSchedDuration] = useState(60);

  const todayKey = toLocalDateKey(new Date());
  const nextWeekKey = toLocalDateKey(addDays(new Date(), 7));

  const scheduledTaskIds = useMemo(() => {
    const set = new Set<string>();
    for (const b of calendarBlocks) {
      if (!b.deleted && b.taskId) set.add(b.taskId);
    }
    return set;
  }, [calendarBlocks]);

  const subjectMap = useMemo(() => {
    const map = new Map<string, Subject>();
    for (const s of subjects) map.set(s.id, s);
    return map;
  }, [subjects]);

  const filteredTasks = useMemo(() => {
    const all = Object.values(tasks).filter((t) => !t.deleted);
    return all
      .filter((t) => {
        if (subjectFilter !== 'all' && t.subjectId !== subjectFilter) return false;
        if (
          searchQuery.trim() &&
          !t.title.toLowerCase().includes(searchQuery.trim().toLowerCase())
        ) {
          return false;
        }
        if (filter === 'completed') return t.status === 'completed';
        if (t.status === 'completed' && filter !== 'all') return false;

        if (filter === 'today') {
          return t.due === todayKey || (t.due && t.due < todayKey);
        }
        if (filter === 'upcoming') {
          return !!t.due && t.due >= todayKey && t.due <= nextWeekKey;
        }
        if (filter === 'unscheduled') {
          return !scheduledTaskIds.has(t.google_task_id);
        }
        return true;
      })
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === 'needsAction' ? -1 : 1;
        const prioRank = { high: 0, medium: 1, low: 2 };
        if (prioRank[a.priority] !== prioRank[b.priority]) {
          return prioRank[a.priority] - prioRank[b.priority];
        }
        return (a.due || '9999-99-99').localeCompare(b.due || '9999-99-99');
      });
  }, [tasks, subjectFilter, searchQuery, filter, todayKey, nextWeekKey, scheduledTaskIds]);

  const counts = useMemo(() => {
    const active = Object.values(tasks).filter((t) => !t.deleted && t.status === 'needsAction');
    return {
      today: active.filter((t) => t.due === todayKey || (t.due && t.due < todayKey)).length,
      upcoming: active.filter((t) => !!t.due && t.due >= todayKey && t.due <= nextWeekKey).length,
      unscheduled: active.filter((t) => !scheduledTaskIds.has(t.google_task_id)).length,
      completed: Object.values(tasks).filter((t) => !t.deleted && t.status === 'completed').length,
      all: Object.values(tasks).filter((t) => !t.deleted).length,
    };
  }, [tasks, todayKey, nextWeekKey, scheduledTaskIds]);

  const openScheduleModal = (task: TaskMetadata) => {
    setSchedulingTask(task);
    setSchedDate(task.due || todayKey);
    setSchedDuration(task.estimated_minutes || 60);
    setSchedTime('14:00');
  };

  const handleConfirmSchedule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!schedulingTask) return;
    const [hh, mm] = schedTime.split(':').map(Number);
    const startMins = (hh || 9) * 60 + (mm || 0);
    onScheduleTask(schedulingTask, schedDate, startMins, schedDuration);
    setSchedulingTask(null);
  };

  const openCreateModal = () => {
    const defaultSubj = subjectFilter !== 'all' ? subjectFilter : subjects[0]?.id || '';
    setTaskForm({
      mode: 'create',
      title: '',
      subjectId: defaultSubj,
      priority: 'medium',
      estimated_minutes: 45,
      due: filter === 'today' ? todayKey : '',
      notes: '',
      repeat: { type: 'none' },
    });
  };

  const openEditModal = (task: TaskMetadata) => {
    setTaskForm({
      mode: 'edit',
      taskId: task.google_task_id,
      title: task.title,
      subjectId: task.subjectId,
      priority: task.priority,
      estimated_minutes: task.estimated_minutes,
      due: task.due || '',
      notes: task.notes || '',
      repeat: task.repeat
        ? { type: task.repeat.type, daysOfWeek: task.repeat.daysOfWeek ? [...task.repeat.daysOfWeek] : undefined }
        : { type: 'none' },
    });
  };

  const handleRepeatTypeChange = (nextType: RepeatType) => {
    if (!taskForm) return;
    let nextRepeat: RepeatRule;
    if (nextType === 'custom') {
      const existingDays =
        taskForm.repeat.daysOfWeek && taskForm.repeat.daysOfWeek.length > 0
          ? taskForm.repeat.daysOfWeek
          : [new Date().getDay()];
      nextRepeat = { type: 'custom', daysOfWeek: existingDays };
    } else {
      nextRepeat = { type: nextType };
    }
    const nextDue =
      nextType !== 'none' && !taskForm.due
        ? todayKey
        : taskForm.due;
    setTaskForm({ ...taskForm, repeat: nextRepeat, due: nextDue });
  };

  const toggleCustomDay = (day: number) => {
    if (!taskForm) return;
    const current = taskForm.repeat.daysOfWeek || [];
    const exists = current.includes(day);
    if (exists && current.length === 1) return; // keep at least one weekday selected
    const updated = exists
      ? current.filter((d) => d !== day)
      : [...current, day].sort((a, b) => a - b);
    setTaskForm({
      ...taskForm,
      repeat: { type: 'custom', daysOfWeek: updated },
    });
  };

  const handleTaskFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskForm || !taskForm.title.trim()) return;
    const cleanRepeat = normalizeRepeatRule(taskForm.repeat);
    const cleanDue = taskForm.due || (cleanRepeat ? todayKey : undefined);

    if (taskForm.mode === 'create') {
      onCreateTask({
        title: taskForm.title.trim(),
        subjectId: taskForm.subjectId,
        estimatedMinutes: taskForm.estimated_minutes,
        priority: taskForm.priority,
        due: cleanDue,
        notes: taskForm.notes.trim() || undefined,
        repeat: cleanRepeat,
      });
    } else if (taskForm.taskId) {
      onUpdateTask(taskForm.taskId, {
        title: taskForm.title.trim(),
        subjectId: taskForm.subjectId,
        estimated_minutes: taskForm.estimated_minutes,
        priority: taskForm.priority,
        due: cleanDue,
        notes: taskForm.notes.trim() || undefined,
        repeat: cleanRepeat,
      });
    }
    setTaskForm(null);
  };

  const filterTabs: Array<{ id: TaskFilter; label: string; count: number }> = [
    { id: 'today', label: 'Today', count: counts.today },
    { id: 'upcoming', label: 'Upcoming', count: counts.upcoming },
    { id: 'unscheduled', label: 'Unscheduled', count: counts.unscheduled },
    { id: 'completed', label: 'Completed', count: counts.completed },
    { id: 'all', label: 'All', count: counts.all },
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 py-6 space-y-6">
      {/* Header + Quick Add */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              Study Tasks
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Type <code className="font-mono">#Subject</code>, duration like{' '}
              <code className="font-mono">60m</code>, priority <code className="font-mono">!high</code>,{' '}
              <code className="font-mono">@today</code>, or <code className="font-mono">every mon,wed,fri</code>
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              {counts.today} due today · {counts.unscheduled} unscheduled
            </span>
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Task</span>
            </button>
          </div>
        </div>

        <QuickAddTaskBar
          subjects={subjects}
          defaultSubjectId={subjectFilter !== 'all' ? subjectFilter : undefined}
          onCreateTask={onCreateTask}
        />
      </div>

      {/* Filters Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div className="flex items-center gap-1 overflow-x-auto p-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800">
          {filterTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                filter === tab.id
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              {tab.label}
              <span className="ml-1.5 font-mono tabular-nums text-[11px] opacity-70">
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-48">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tasks..."
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 pl-8 pr-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <select
            value={subjectFilter}
            onChange={(e) => setSubjectFilter(e.target.value)}
            aria-label="Filter by subject"
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            <option value="all">All Subjects</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Task List */}
      {filteredTasks.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 py-14 px-6 text-center">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
            No tasks match this view
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Add a task above using quick-add syntax or switch your active filter.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-slate-200/80 dark:divide-slate-800 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          {filteredTasks.map((task) => {
            const subj = subjectMap.get(task.subjectId);
            const isCompleted = task.status === 'completed';
            const isScheduled = scheduledTaskIds.has(task.google_task_id);
            const isOverdue = !!task.due && task.due < todayKey && !isCompleted;
            const repeatLabel = formatRepeatLabel(task.repeat);

            return (
              <div
                key={task.google_task_id}
                className="group flex items-start sm:items-center justify-between gap-3 px-4 py-3.5 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
              >
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateTask(task.google_task_id, {
                        status: isCompleted ? 'needsAction' : 'completed',
                        completedAt: isCompleted ? undefined : new Date().toISOString(),
                      })
                    }
                    className={`mt-0.5 flex h-6 w-6 min-h-[24px] min-w-[24px] shrink-0 items-center justify-center rounded-md border transition-colors cursor-pointer ${
                      isCompleted
                        ? 'border-blue-600 bg-blue-600 text-white'
                        : 'border-slate-300 dark:border-slate-600 hover:border-blue-600'
                    }`}
                    aria-label={isCompleted ? 'Mark incomplete' : 'Mark complete'}
                  >
                    {isCompleted && <Check className="w-3.5 h-3.5" />}
                  </button>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-xs shrink-0"
                        style={{ backgroundColor: subj?.color || '#64748b' }}
                      />
                      <span
                        className={`text-sm font-medium truncate ${
                          isCompleted
                            ? 'line-through text-slate-400 dark:text-slate-500'
                            : 'text-slate-900 dark:text-slate-100'
                        }`}
                      >
                        {task.title}
                      </span>
                    </div>

                    {/* Zero-Pill Clean Inline Metadata */}
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                      <span>{subj?.name || 'No Subject'}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">
                        {formatDurationCompact(task.estimated_minutes)} est
                      </span>
                      {task.logged_minutes > 0 && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums text-blue-600 dark:text-blue-400">
                            {formatDurationCompact(task.logged_minutes)} logged
                          </span>
                        </>
                      )}
                      <span aria-hidden="true">·</span>
                      <span
                        className={
                          task.priority === 'high'
                            ? 'text-rose-600 dark:text-rose-400 font-medium'
                            : task.priority === 'medium'
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-slate-500'
                        }
                      >
                        {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
                      </span>
                      {task.due && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span
                            className={
                              isOverdue
                                ? 'text-rose-600 dark:text-rose-400 font-medium'
                                : ''
                            }
                          >
                            {isOverdue ? 'Overdue ' : 'Due '}
                            {formatShortDate(task.due)}
                          </span>
                        </>
                      )}
                      {repeatLabel && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400">
                            <Repeat className="w-3 h-3" />
                            {repeatLabel}
                          </span>
                        </>
                      )}
                      {isScheduled && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-emerald-600 dark:text-emerald-400">Scheduled</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-1 shrink-0">
                  {!isCompleted && (
                    <button
                      type="button"
                      onClick={() => onStartTimerForTask(task)}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/50 dark:hover:text-blue-400 transition-colors cursor-pointer"
                      title="Start study timer"
                      aria-label={`Start timer for ${task.title}`}
                    >
                      <Play className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => openScheduleModal(task)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                    title="Schedule on calendar"
                    aria-label={`Schedule ${task.title}`}
                  >
                    <CalendarPlus className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => openEditModal(task)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                    title="Edit task"
                    aria-label={`Edit ${task.title}`}
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteTask(task)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                    title="Delete task"
                    aria-label={`Delete ${task.title}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Task Modal */}
      {taskForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/50 backdrop-blur-xs p-0 sm:p-4">
          <form
            onSubmit={handleTaskFormSubmit}
            className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                {taskForm.mode === 'create' ? 'New Study Task' : 'Edit Study Task'}
              </h3>
              <button
                type="button"
                onClick={() => setTaskForm(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                  Title
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Revise Organic Chemistry"
                  value={taskForm.title}
                  onChange={(e) =>
                    setTaskForm({ ...taskForm, title: e.target.value })
                  }
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                    Subject
                  </label>
                  <select
                    value={taskForm.subjectId}
                    onChange={(e) =>
                      setTaskForm({ ...taskForm, subjectId: e.target.value })
                    }
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                  >
                    <option value="">No Subject</option>
                    {subjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                    Priority
                  </label>
                  <select
                    value={taskForm.priority}
                    onChange={(e) =>
                      setTaskForm({
                        ...taskForm,
                        priority: e.target.value as Priority,
                      })
                    }
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                  >
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                    Estimated (mins)
                  </label>
                  <input
                    type="number"
                    min={15}
                    max={480}
                    step={15}
                    value={taskForm.estimated_minutes}
                    onChange={(e) =>
                      setTaskForm({
                        ...taskForm,
                        estimated_minutes: Math.max(15, Number(e.target.value) || 15),
                      })
                    }
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono tabular-nums text-slate-900 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                    Due Date
                  </label>
                  <input
                    type="date"
                    value={taskForm.due}
                    onChange={(e) =>
                      setTaskForm({
                        ...taskForm,
                        due: e.target.value,
                      })
                    }
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>

              {/* Repeat Selector */}
              <div className="space-y-2">
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                  Repeat
                </label>
                <select
                  value={taskForm.repeat.type}
                  onChange={(e) => handleRepeatTypeChange(e.target.value as RepeatType)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                >
                  <option value="none">None</option>
                  <option value="daily">Daily</option>
                  <option value="weekdays">Weekdays (Mon–Fri)</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="custom">Custom Days of Week</option>
                </select>

                {taskForm.repeat.type === 'custom' && (
                  <div className="grid grid-cols-7 gap-1 pt-0.5">
                    {WEEKDAY_BUTTONS.map(({ day, label }) => {
                      const active = (taskForm.repeat.daysOfWeek || []).includes(day);
                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() => toggleCustomDay(day)}
                          className={`py-1.5 rounded-lg text-[11px] font-medium border transition-colors cursor-pointer ${
                            active
                              ? 'border-blue-600 bg-blue-600 text-white'
                              : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600'
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                )}

                {taskForm.repeat.type !== 'none' && (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    When completed, history is preserved and the next occurrence is scheduled automatically.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                  Notes
                </label>
                <textarea
                  rows={2}
                  value={taskForm.notes}
                  onChange={(e) =>
                    setTaskForm({ ...taskForm, notes: e.target.value })
                  }
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setTaskForm(null)}
                className="rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-blue-600 hover:bg-blue-700 px-4 py-2 text-xs font-medium text-white cursor-pointer"
              >
                {taskForm.mode === 'create' ? 'Create Task' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Schedule onto Calendar Modal */}
      {schedulingTask && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/50 backdrop-blur-xs p-0 sm:p-4">
          <form
            onSubmit={handleConfirmSchedule}
            className="w-full max-w-sm rounded-t-3xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Schedule Time Block
              </h3>
              <button
                type="button"
                onClick={() => setSchedulingTask(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
              {schedulingTask.title}
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                  Date
                </label>
                <input
                  type="date"
                  required
                  value={schedDate}
                  onChange={(e) => setSchedDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono text-slate-900 dark:text-slate-100"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                    Start Time
                  </label>
                  <input
                    type="time"
                    step={900}
                    required
                    value={schedTime}
                    onChange={(e) => setSchedTime(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                    Duration (min)
                  </label>
                  <select
                    value={schedDuration}
                    onChange={(e) => setSchedDuration(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono text-slate-900 dark:text-slate-100"
                  >
                    {[15, 30, 45, 60, 75, 90, 120, 150, 180].map((m) => (
                      <option key={m} value={m}>
                        {formatDurationCompact(m)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSchedulingTask(null)}
                className="rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-blue-600 hover:bg-blue-700 px-4 py-2 text-xs font-medium text-white cursor-pointer"
              >
                Add to Calendar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Explicit Confirmation Dialog for Task Deletion */}
      {confirmDeleteTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Delete Task?
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Delete <strong>{confirmDeleteTask.title}</strong>?
              {isGoogleConnected && confirmDeleteTask.googleTaskListId
                ? ' This will also remove the task from your synced Google Tasks list on the next sync.'
                : ' Scheduled blocks linked to this task will remain unless removed.'}
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteTask(null)}
                className="rounded-lg border border-slate-200 dark:border-slate-700 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteTask(confirmDeleteTask.google_task_id);
                  setConfirmDeleteTask(null);
                }}
                className="rounded-lg bg-rose-600 hover:bg-rose-700 px-3.5 py-2 text-xs font-medium text-white cursor-pointer"
              >
                Delete Task
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
