import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Play,
  GripVertical,
  Lock,
  Check,
  X,
  Trash2,
  Flag,
  Repeat,
  ExternalLink,
  CheckSquare,
} from 'lucide-react';
import type {
  CalendarBlock,
  ExamCountdown,
  GoogleCalendarEventOverlay,
  Priority,
  RepeatRule,
  Subject,
  TaskMetadata,
} from '../types';
import {
  addDays,
  daysUntil,
  formatDurationCompact,
  formatMinutesAsClock,
  formatShortDate,
  getWeekDays,
  snapMinutes15,
  toLocalDateKey,
} from '../utils/dateUtils';
import { formatRepeatLabel } from '../utils/recurrence';
import { QuickAddTaskBar } from './QuickAddTaskBar';

const START_HOUR = 0;
const END_HOUR = 24;
const TOTAL_HOURS = END_HOUR - START_HOUR;
const HOUR_HEIGHT = 60; // 60px per hour => 1px per minute, 15px per 15-min snap
const CORE_DAY_START_HOUR = 6;

function hexWithAlpha(hex: string, alphaHex: string): string {
  const clean = hex.trim();
  if (/^#[0-9a-f]{6}$/i.test(clean)) return `${clean}${alphaHex}`;
  if (/^#[0-9a-f]{3}$/i.test(clean)) {
    const r = clean[1];
    const g = clean[2];
    const b = clean[3];
    return `#${r}${r}${g}${g}${b}${b}${alphaHex}`;
  }
  return `#2563EB${alphaHex}`;
}

interface TimeBlockingCalendarProps {
  weekStart: Date;
  onChangeWeekStart: (d: Date) => void;
  subjects: Subject[];
  tasks: Record<string, TaskMetadata>;
  blocks: CalendarBlock[];
  googleEvents: GoogleCalendarEventOverlay[];
  examBanners: ExamCountdown[];
  onCreateTask: (input: {
    title: string;
    subjectId: string;
    estimatedMinutes: number;
    priority: Priority;
    due?: string;
    repeat?: RepeatRule;
  }) => void;
  onCreateBlock: (block: Omit<CalendarBlock, 'id' | 'updatedAt'>) => void;
  onUpdateBlock: (blockId: string, patch: Partial<CalendarBlock>) => void;
  onDeleteBlock: (blockId: string) => void;
  onStartTimerForBlock: (block: CalendarBlock) => void;
  onStartTimerForTask: (task: TaskMetadata) => void;
  onAddExam: (exam: Omit<ExamCountdown, 'id'>) => void;
  onDeleteExam: (examId: string) => void;
}

export const TimeBlockingCalendar: React.FC<TimeBlockingCalendarProps> = ({
  weekStart,
  onChangeWeekStart,
  subjects,
  tasks,
  blocks,
  googleEvents,
  examBanners,
  onCreateTask,
  onCreateBlock,
  onUpdateBlock,
  onDeleteBlock,
  onStartTimerForBlock,
  onStartTimerForTask,
  onAddExam,
  onDeleteExam,
}) => {
  const [backlogFilter, setBacklogFilter] = useState<'unscheduled' | 'today' | 'all'>('unscheduled');
  const [selectedMobileDay, setSelectedMobileDay] = useState<string>(() =>
    toLocalDateKey(new Date())
  );
  const [dragPreview, setDragPreview] = useState<{
    date: string;
    startMinutes: number;
    durationMinutes: number;
  } | null>(null);
  const [resizingState, setResizingState] = useState<{
    blockId: string;
    previewDuration: number;
  } | null>(null);
  const [selectedBlock, setSelectedBlock] = useState<CalendarBlock | null>(null);
  const [editingBlockTitle, setEditingBlockTitle] = useState('');
  const [selectedGcalEvent, setSelectedGcalEvent] = useState<GoogleCalendarEventOverlay | null>(null);
  const [gcalConvertSubjectId, setGcalConvertSubjectId] = useState(subjects[0]?.id || '');
  const [gcalConvertDuration, setGcalConvertDuration] = useState(60);
  const [dragCreatePreview, setDragCreatePreview] = useState<{
    date: string;
    startMinutes: number;
    durationMinutes: number;
  } | null>(null);
  const [creatingSlot, setCreatingSlot] = useState<{
    date: string;
    startMinutes: number;
  } | null>(null);
  const [newBlockTitle, setNewBlockTitle] = useState('');
  const [newBlockSubjectId, setNewBlockSubjectId] = useState(subjects[0]?.id || '');
  const [newBlockDuration, setNewBlockDuration] = useState(60);

  // Exam countdown modal state
  const [showExamModal, setShowExamModal] = useState(false);
  const [examTitle, setExamTitle] = useState('');
  const [examSubjectId, setExamSubjectId] = useState(subjects[0]?.id || '');
  const [examDate, setExamDate] = useState(() => toLocalDateKey(addDays(new Date(), 14)));

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const suppressNextEmptyClickRef = useRef(false);

  const scrollToSmartAnchor = (behavior: ScrollBehavior = 'auto') => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const now = new Date();
    const targetHour = Math.max(CORE_DAY_START_HOUR, now.getHours() - 1);
    const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight);
    const targetTop = Math.min(targetHour * HOUR_HEIGHT, maxScroll);
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollTo({
      top: targetTop,
      behavior: prefersReducedMotion ? 'auto' : behavior,
    });
  };

  // Smart auto-scroll to 06:00 (or 1h before current time if later) on initial mount
  useEffect(() => {
    scrollToSmartAnchor('auto');
  }, []);

  const weekDays = useMemo(() => getWeekDays(weekStart), [weekStart]);
  const todayKey = toLocalDateKey(new Date());

  const subjectMap = useMemo(() => {
    const map = new Map<string, Subject>();
    for (const s of subjects) map.set(s.id, s);
    return map;
  }, [subjects]);

  const scheduledTaskIds = useMemo(() => {
    const set = new Set<string>();
    for (const b of blocks) {
      if (!b.deleted && b.taskId) set.add(b.taskId);
    }
    return set;
  }, [blocks]);

  const backlogTasks = useMemo(() => {
    return Object.values(tasks)
      .filter((t) => !t.deleted && t.status === 'needsAction')
      .filter((t) => {
        if (backlogFilter === 'unscheduled') return !scheduledTaskIds.has(t.google_task_id);
        if (backlogFilter === 'today') return t.due === todayKey || (t.due && t.due < todayKey);
        return true;
      })
      .sort((a, b) => {
        const prioRank = { high: 0, medium: 1, low: 2 };
        return prioRank[a.priority] - prioRank[b.priority];
      });
  }, [tasks, backlogFilter, scheduledTaskIds, todayKey]);

  const activeBlocks = useMemo(
    () => blocks.filter((b) => !b.deleted),
    [blocks]
  );

  const syncedEventIds = useMemo(
    () =>
      new Set(
        activeBlocks
          .map((b) => b.googleEventId)
          .filter((id): id is string => Boolean(id))
      ),
    [activeBlocks]
  );

  useEffect(() => {
    setEditingBlockTitle(selectedBlock?.title || '');
  }, [selectedBlock?.id, selectedBlock?.title]);

  // Current time indicator position
  const [nowMinutes, setNowMinutes] = useState(() => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  });
  useEffect(() => {
    const id = setInterval(() => {
      const d = new Date();
      setNowMinutes(d.getHours() * 60 + d.getMinutes());
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  // Drag-and-drop handlers
  const getMinutesFromPointerY = (clientY: number, colEl: HTMLElement): number => {
    const rect = colEl.getBoundingClientRect();
    const offsetY = Math.max(0, Math.min(rect.height - 15, clientY - rect.top));
    const rawMins = START_HOUR * 60 + (offsetY / HOUR_HEIGHT) * 60;
    return Math.max(START_HOUR * 60, Math.min(END_HOUR * 60 - 15, snapMinutes15(rawMins)));
  };

  const handleTaskDragStart = (e: React.DragEvent, task: TaskMetadata) => {
    e.dataTransfer.setData(
      'application/json',
      JSON.stringify({
        kind: 'task',
        taskId: task.google_task_id,
        duration: task.estimated_minutes || 45,
      })
    );
    e.dataTransfer.effectAllowed = 'copyMove';
  };

  const handleBlockDragStart = (e: React.DragEvent, block: CalendarBlock) => {
    e.dataTransfer.setData(
      'application/json',
      JSON.stringify({
        kind: 'block',
        blockId: block.id,
        duration: block.durationMinutes,
      })
    );
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleColumnDragOver = (e: React.DragEvent, dateKey: string) => {
    e.preventDefault();
    const startMinutes = getMinutesFromPointerY(e.clientY, e.currentTarget as HTMLElement);
    setDragPreview({
      date: dateKey,
      startMinutes,
      durationMinutes: dragPreview?.durationMinutes || 60,
    });
  };

  const handleColumnDrop = (e: React.DragEvent, dateKey: string) => {
    e.preventDefault();
    setDragPreview(null);
    const raw = e.dataTransfer.getData('application/json');
    if (!raw) return;

    try {
      const payload = JSON.parse(raw) as {
        kind: 'task' | 'block';
        taskId?: string;
        blockId?: string;
        duration?: number;
      };
      const startMinutes = getMinutesFromPointerY(e.clientY, e.currentTarget as HTMLElement);

      if (payload.kind === 'task' && payload.taskId) {
        const t = tasks[payload.taskId];
        if (!t) return;
        const dur = snapMinutes15(Math.max(15, t.estimated_minutes || 45));
        onCreateBlock({
          taskId: t.google_task_id,
          subjectId: t.subjectId,
          title: t.title,
          date: dateKey,
          startMinutes: Math.min(startMinutes, END_HOUR * 60 - dur),
          durationMinutes: dur,
        });
      } else if (payload.kind === 'block' && payload.blockId) {
        const blk = blocks.find((b) => b.id === payload.blockId);
        if (!blk) return;
        onUpdateBlock(blk.id, {
          date: dateKey,
          startMinutes: Math.min(startMinutes, END_HOUR * 60 - blk.durationMinutes),
        });
      }
    } catch {
      // Ignore malformed drop payload
    }
  };

  // Bottom-edge resize pointer handler
  const handleResizeStart = (e: React.PointerEvent, block: CalendarBlock) => {
    e.stopPropagation();
    e.preventDefault();
    const startY = e.clientY;
    const origDuration = block.durationMinutes;
    const maxAllowed = END_HOUR * 60 - block.startMinutes;

    setResizingState({ blockId: block.id, previewDuration: origDuration });

    const onMove = (moveEvent: PointerEvent) => {
      const deltaPx = moveEvent.clientY - startY;
      const rawMins = origDuration + (deltaPx / HOUR_HEIGHT) * 60;
      const snapped = Math.max(15, Math.min(maxAllowed, snapMinutes15(rawMins)));
      setResizingState({ blockId: block.id, previewDuration: snapped });
    };

    const onUp = (upEvent: PointerEvent) => {
      const deltaPx = upEvent.clientY - startY;
      const rawMins = origDuration + (deltaPx / HOUR_HEIGHT) * 60;
      const finalDuration = Math.max(15, Math.min(maxAllowed, snapMinutes15(rawMins)));
      onUpdateBlock(block.id, { durationMinutes: finalDuration });
      setResizingState(null);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const handleColumnPointerDown = (e: React.PointerEvent, dateKey: string) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('[data-calendar-block="true"]')) return;

    const colEl = e.currentTarget as HTMLElement;
    const startY = e.clientY;
    const anchorMins = getMinutesFromPointerY(startY, colEl);
    let hasDragged = false;
    let latestStart = anchorMins;
    let latestDuration = 60;

    const onMove = (moveEvent: PointerEvent) => {
      if (Math.abs(moveEvent.clientY - startY) < 12 && !hasDragged) return;
      hasDragged = true;
      const currentMins = getMinutesFromPointerY(moveEvent.clientY, colEl);
      latestStart = Math.min(anchorMins, currentMins);
      const endMins = Math.min(END_HOUR * 60, Math.max(anchorMins, currentMins) + 15);
      latestDuration = Math.max(15, endMins - latestStart);
      setDragCreatePreview({
        date: dateKey,
        startMinutes: latestStart,
        durationMinutes: latestDuration,
      });
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setDragCreatePreview(null);
      if (hasDragged) {
        suppressNextEmptyClickRef.current = true;
        setNewBlockTitle('');
        setNewBlockSubjectId(subjects[0]?.id || '');
        setNewBlockDuration(latestDuration);
        setCreatingSlot({ date: dateKey, startMinutes: latestStart });
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const handleEmptySlotClick = (e: React.MouseEvent, dateKey: string) => {
    if (suppressNextEmptyClickRef.current) {
      suppressNextEmptyClickRef.current = false;
      return;
    }
    if ((e.target as HTMLElement).closest('[data-calendar-block="true"]')) return;
    const startMinutes = getMinutesFromPointerY(e.clientY, e.currentTarget as HTMLElement);
    setNewBlockTitle('');
    setNewBlockSubjectId(subjects[0]?.id || '');
    setNewBlockDuration(60);
    setCreatingSlot({ date: dateKey, startMinutes });
  };

  const openGcalEventModal = (ev: GoogleCalendarEventOverlay) => {
    const lowerSummary = ev.summary.toLowerCase();
    const matchedSubj = subjects.find((s) =>
      lowerSummary.includes(s.name.trim().toLowerCase())
    );
    setGcalConvertSubjectId(matchedSubj?.id || subjects[0]?.id || '');
    setGcalConvertDuration(
      snapMinutes15(Math.max(15, Math.min(480, ev.durationMinutes || 60)))
    );
    setSelectedGcalEvent(ev);
  };

  const handleConvertGcalEventSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGcalEvent) return;
    const maxDuration = Math.max(15, END_HOUR * 60 - selectedGcalEvent.startMinutes);
    onCreateBlock({
      subjectId: gcalConvertSubjectId || subjects[0]?.id || '',
      title: selectedGcalEvent.summary || 'Study Session',
      date: selectedGcalEvent.date,
      startMinutes: selectedGcalEvent.startMinutes,
      durationMinutes: Math.min(gcalConvertDuration, maxDuration),
      ...(selectedGcalEvent.isAllDay ? {} : { googleEventId: selectedGcalEvent.id }),
    });
    setSelectedGcalEvent(null);
  };

  const handleCreateSlotSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!creatingSlot || !newBlockTitle.trim()) return;
    const maxDuration = Math.max(15, END_HOUR * 60 - creatingSlot.startMinutes);
    onCreateBlock({
      subjectId: newBlockSubjectId || subjects[0]?.id || '',
      title: newBlockTitle.trim(),
      date: creatingSlot.date,
      startMinutes: creatingSlot.startMinutes,
      durationMinutes: Math.min(newBlockDuration, maxDuration),
    });
    setCreatingSlot(null);
  };

  const handleAddExamSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!examTitle.trim() || !examDate) return;
    onAddExam({
      title: examTitle.trim(),
      subjectId: examSubjectId || subjects[0]?.id || '',
      date: examDate,
    });
    setExamTitle('');
    setShowExamModal(false);
  };

  const sortedExams = useMemo(() => {
    return [...examBanners]
      .filter((ex) => daysUntil(ex.date) >= -1)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [examBanners]);

  const hoursList = useMemo(
    () => Array.from({ length: TOTAL_HOURS }, (_, i) => START_HOUR + i),
    []
  );

  const renderDayColumnContent = (dateKey: string) => {
    const dayBlocks = activeBlocks.filter((b) => b.date === dateKey);
    const dayGcal = googleEvents.filter(
      (ev) => ev.date === dateKey && !syncedEventIds.has(ev.id)
    );
    const isToday = dateKey === todayKey;

    return (
      <>
        {/* Hour gridlines */}
        {hoursList.map((hr) => (
          <div
            key={hr}
            style={{ height: `${HOUR_HEIGHT}px` }}
            className="border-b border-slate-100 dark:border-slate-800/70 pointer-events-none"
          />
        ))}

        {/* Drag Drop Preview Ghost */}
        {dragPreview && dragPreview.date === dateKey && (
          <div
            style={{
              top: `${((dragPreview.startMinutes - START_HOUR * 60) / 60) * HOUR_HEIGHT}px`,
              height: `${(dragPreview.durationMinutes / 60) * HOUR_HEIGHT}px`,
            }}
            className="absolute inset-x-1 z-10 rounded-lg border border-dashed border-blue-500 bg-blue-500/10 pointer-events-none px-2 py-1 text-[11px] font-mono text-blue-600 dark:text-blue-400"
          >
            {formatMinutesAsClock(dragPreview.startMinutes)}
          </div>
        )}

        {/* Drag-to-Create Timeline Selection Ghost */}
        {dragCreatePreview && dragCreatePreview.date === dateKey && (
          <div
            style={{
              top: `${((dragCreatePreview.startMinutes - START_HOUR * 60) / 60) * HOUR_HEIGHT}px`,
              height: `${Math.max(18, (dragCreatePreview.durationMinutes / 60) * HOUR_HEIGHT)}px`,
            }}
            className="absolute inset-x-1 z-30 rounded-lg border-2 border-dashed border-blue-600 bg-blue-500/15 pointer-events-none px-2 py-1 text-[11px] font-mono text-blue-700 dark:text-blue-300"
          >
            {formatMinutesAsClock(dragCreatePreview.startMinutes)}–
            {formatMinutesAsClock(
              dragCreatePreview.startMinutes + dragCreatePreview.durationMinutes
            )}{' '}
            ({formatDurationCompact(dragCreatePreview.durationMinutes)})
          </div>
        )}

        {/* External Google Calendar Event Overlay */}
        {dayGcal.map((ev) => {
          const clampedStart = Math.max(START_HOUR * 60, ev.startMinutes);
          const clampedEnd = Math.min(END_HOUR * 60, ev.startMinutes + ev.durationMinutes);
          if (clampedEnd <= clampedStart) return null;
          const topPx = ((clampedStart - START_HOUR * 60) / 60) * HOUR_HEIGHT;
          const heightPx = Math.max(22, ((clampedEnd - clampedStart) / 60) * HOUR_HEIGHT);

          return (
            <div
              key={`gcal-${ev.id}`}
              data-calendar-block="true"
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                openGcalEventModal(ev);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  e.stopPropagation();
                  openGcalEventModal(ev);
                }
              }}
              style={{ top: `${topPx}px`, height: `${heightPx}px` }}
              title={`${ev.summary} (Google Calendar · Click for options)`}
              className="absolute left-1 right-1 z-10 rounded-lg border border-slate-200 dark:border-slate-700/80 bg-slate-100/90 dark:bg-slate-800/70 gcal-overlay-pattern px-2 py-1 overflow-hidden pointer-events-auto cursor-pointer hover:border-slate-400 dark:hover:border-slate-500 transition-colors"
            >
              <div className="flex items-center gap-1 text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate">
                <Lock className="w-2.5 h-2.5 shrink-0 opacity-75" />
                <span className="truncate">{ev.summary}</span>
              </div>
              {heightPx >= 36 && (
                <div className="text-[10px] font-mono tabular-nums text-slate-400 dark:text-slate-500">
                  {ev.isAllDay ? 'All day' : formatMinutesAsClock(ev.startMinutes)}
                </div>
              )}
            </div>
          );
        })}

        {/* Study Time Blocks */}
        {dayBlocks.map((block) => {
          const subj = subjectMap.get(block.subjectId);
          const color = subj?.color || '#2563EB';
          const effectiveDuration =
            resizingState?.blockId === block.id
              ? resizingState.previewDuration
              : block.durationMinutes;

          const plannedMinutes = Math.max(15, effectiveDuration);
          const actualMinutes = Math.max(0, block.actualMinutes || 0);
          const fillPercent = Math.min((actualMinutes / plannedMinutes) * 100, 100);
          const overtimeMinutes = Math.max(0, actualMinutes - plannedMinutes);
          const isTargetMet = actualMinutes > 0 && actualMinutes >= plannedMinutes;

          const statusBadgeText =
            actualMinutes > 0
              ? isTargetMet
                ? overtimeMinutes > 0
                  ? `✓ ${actualMinutes}m (+${overtimeMinutes}m)`
                  : `✓ ${actualMinutes}m`
                : `${actualMinutes}m / ${plannedMinutes}m`
              : null;

          const topPx = ((block.startMinutes - START_HOUR * 60) / 60) * HOUR_HEIGHT;
          const heightPx = Math.max(20, (effectiveDuration / 60) * HOUR_HEIGHT);

          const maxExtraMinutes = Math.max(0, END_HOUR * 60 - (block.startMinutes + effectiveDuration));
          const visibleOvertimeMinutes = Math.min(overtimeMinutes, maxExtraMinutes);
          const overtimeHeightPx =
            visibleOvertimeMinutes > 0
              ? Math.max(12, (visibleOvertimeMinutes / 60) * HOUR_HEIGHT)
              : 0;

          const statusPillEl = statusBadgeText ? (
            <span
              className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] leading-none font-mono tabular-nums font-medium whitespace-nowrap shrink-0 border ${
                isTargetMet
                  ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200 border-emerald-500/35'
                  : 'bg-white/85 dark:bg-slate-900/85 text-slate-700 dark:text-slate-200 border-slate-300/70 dark:border-slate-700'
              }`}
            >
              {statusBadgeText}
            </span>
          ) : null;

          return (
            <React.Fragment key={block.id}>
              <div
                data-calendar-block="true"
                draggable
                onDragStart={(e) => handleBlockDragStart(e, block)}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedBlock(block);
                }}
                style={{
                  top: `${topPx}px`,
                  height: `${heightPx}px`,
                  backgroundColor: hexWithAlpha(color, '14'),
                  borderColor: hexWithAlpha(color, '55'),
                }}
                className={`group absolute left-1 right-1 z-20 rounded-lg border px-2 ${
                  heightPx < 30 ? 'py-0.5' : 'py-1'
                } select-none cursor-pointer transition-shadow hover:shadow-sm overflow-hidden flex flex-col justify-between`}
              >
                {/* Ghost Progress Fill anchored to top */}
                {actualMinutes > 0 && (
                  <div
                    aria-hidden="true"
                    style={{
                      height: `${fillPercent}%`,
                      backgroundColor: hexWithAlpha(color, '38'),
                      borderBottom:
                        fillPercent > 0 && fillPercent < 100
                          ? `1px solid ${hexWithAlpha(color, '70')}`
                          : undefined,
                    }}
                    className="pointer-events-none absolute top-0 left-0 right-0 transition-[height] duration-300"
                  />
                )}

                <div className="relative z-10 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className="w-2 h-2 rounded-xs shrink-0"
                        style={{ backgroundColor: color }}
                      />
                      <span
                        className={`text-xs font-medium truncate text-slate-900 dark:text-slate-100 ${
                          block.completed ? 'line-through opacity-60' : ''
                        }`}
                      >
                        {block.title}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {statusPillEl && heightPx < 58 && statusPillEl}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onStartTimerForBlock(block);
                        }}
                        className="opacity-0 group-hover:opacity-100 focus:opacity-100 shrink-0 p-1 rounded-md bg-white/80 dark:bg-slate-900/80 text-blue-600 dark:text-blue-400 hover:bg-white transition-opacity cursor-pointer"
                        title="Start focus timer"
                        aria-label={`Start timer for ${block.title}`}
                      >
                        <Play className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  {heightPx >= 38 && (
                    <div className="mt-0.5 text-[10px] font-mono tabular-nums text-slate-600 dark:text-slate-400 truncate">
                      {formatMinutesAsClock(block.startMinutes)}–
                      {formatMinutesAsClock(block.startMinutes + effectiveDuration)} ·{' '}
                      {formatDurationCompact(effectiveDuration)}
                    </div>
                  )}

                  {statusPillEl && heightPx >= 58 && (
                    <div className="mt-1 flex items-center">{statusPillEl}</div>
                  )}
                </div>

                {/* Bottom-edge resize handle */}
                <div
                  onPointerDown={(e) => handleResizeStart(e, block)}
                  onClick={(e) => e.stopPropagation()}
                  title="Drag to resize duration"
                  className="absolute inset-x-0 bottom-0 z-20 h-2.5 cursor-ns-resize flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <span className="w-7 h-0.5 rounded-full bg-slate-400/70 dark:bg-slate-500/70" />
                </div>
              </div>

              {/* Subtle dashed overtime extension below planned block height */}
              {overtimeHeightPx > 0 && (
                <div
                  aria-hidden="true"
                  style={{
                    top: `${topPx + heightPx - 1}px`,
                    height: `${overtimeHeightPx + 1}px`,
                    backgroundColor: hexWithAlpha(color, '1C'),
                    borderColor: hexWithAlpha(color, '70'),
                  }}
                  className="pointer-events-none absolute left-1 right-1 z-10 rounded-b-lg border border-t-0 border-dashed flex items-end justify-end px-2 py-0.5"
                >
                  {overtimeHeightPx >= 16 && (
                    <span
                      className="text-[10px] font-mono tabular-nums font-medium"
                      style={{ color }}
                    >
                      +{overtimeMinutes}m over
                    </span>
                  )}
                </div>
              )}
            </React.Fragment>
          );
        })}

        {/* Current Time Indicator */}
        {isToday && nowMinutes >= START_HOUR * 60 && nowMinutes <= END_HOUR * 60 && (
          <div
            style={{
              top: `${((nowMinutes - START_HOUR * 60) / 60) * HOUR_HEIGHT}px`,
            }}
            className="absolute inset-x-0 z-30 pointer-events-none flex items-center"
          >
            <span className="w-2 h-2 -ml-1 rounded-full bg-blue-600" />
            <div className="flex-1 h-[1.5px] bg-blue-600" />
          </div>
        )}
      </>
    );
  };

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-56px-52px)] md:h-[calc(100vh-57px-52px)] overflow-hidden">
      {/* LEFT PANEL: Desktop Task Backlog (hidden on small screens; mobile uses Tasks tab or tap-to-schedule) */}
      <aside className="hidden lg:flex lg:w-80 shrink-0 flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Task Backlog
            </h2>
            <span className="text-xs font-mono tabular-nums text-slate-500">
              {backlogTasks.length}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800/70">
            {(['unscheduled', 'today', 'all'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setBacklogFilter(tab)}
                className={`py-1 rounded-md text-xs font-medium capitalize transition-colors cursor-pointer ${
                  backlogFilter === tab
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          <QuickAddTaskBar subjects={subjects} compact onCreateTask={onCreateTask} />
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {backlogTasks.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-800 p-6 text-center text-xs text-slate-500 dark:text-slate-400">
              No tasks in this backlog filter. Add one above or switch tabs.
            </div>
          ) : (
            backlogTasks.map((task) => {
              const subj = subjectMap.get(task.subjectId);
              return (
                <div
                  key={task.google_task_id}
                  draggable
                  onDragStart={(e) => handleTaskDragStart(e, task)}
                  className="group rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-3 cursor-grab active:cursor-grabbing hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 min-w-0">
                      <GripVertical className="w-3.5 h-3.5 mt-0.5 text-slate-400 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-slate-900 dark:text-slate-100 leading-snug">
                          {task.title}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                          <span
                            className="inline-block w-2 h-2 rounded-xs shrink-0"
                            style={{ backgroundColor: subj?.color || '#64748b' }}
                          />
                          <span>{subj?.name || 'No Subject'}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">
                            {formatDurationCompact(task.estimated_minutes)}
                          </span>
                          {task.due && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>{formatShortDate(task.due)}</span>
                            </>
                          )}
                          {formatRepeatLabel(task.repeat) && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="inline-flex items-center gap-0.5 text-blue-600 dark:text-blue-400">
                                <Repeat className="w-2.5 h-2.5" />
                                {formatRepeatLabel(task.repeat)}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => onStartTimerForTask(task)}
                      className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-white dark:hover:bg-slate-800 transition-all cursor-pointer shrink-0"
                      title="Start timer"
                    >
                      <Play className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </aside>

      {/* RIGHT PANEL: Time-Blocking Calendar */}
      <section className="flex-1 flex flex-col min-w-0 bg-slate-50 dark:bg-slate-950">
        {/* Calendar Header Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <div className="inline-flex items-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
              <button
                type="button"
                onClick={() => onChangeWeekStart(addDays(weekStart, -7))}
                className="p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-l-lg cursor-pointer"
                aria-label="Previous week"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  const now = new Date();
                  setSelectedMobileDay(toLocalDateKey(now));
                  const day = now.getDay();
                  const diff = day === 0 ? -6 : 1 - day;
                  onChangeWeekStart(addDays(new Date(now.getFullYear(), now.getMonth(), now.getDate()), diff));
                  requestAnimationFrame(() => scrollToSmartAnchor('smooth'));
                }}
                className="px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 border-x border-slate-200 dark:border-slate-700 cursor-pointer"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => onChangeWeekStart(addDays(weekStart, 7))}
                className="p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-r-lg cursor-pointer"
                aria-label="Next week"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
              {weekDays[0].toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} –{' '}
              {weekDays[6].toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowExamModal(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            >
              <Flag className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              <span>Pin Exam</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setNewBlockTitle('');
                setNewBlockDuration(60);
                setCreatingSlot({ date: selectedMobileDay || todayKey, startMinutes: 14 * 60 });
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 px-3 py-1.5 text-xs font-medium text-white transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Block</span>
            </button>
          </div>
        </div>

        {/* Pinned Exam Countdown Banners */}
        {sortedExams.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/60 px-4 py-2">
            {sortedExams.map((ex) => {
              const subj = subjectMap.get(ex.subjectId);
              const left = daysUntil(ex.date);
              const label = left === 0 ? 'Today' : left < 0 ? 'Passed' : `${left}d left`;
              return (
                <div
                  key={ex.id}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 px-2.5 py-1 text-xs shrink-0"
                >
                  <span
                    className="w-2 h-2 rounded-xs shrink-0"
                    style={{ backgroundColor: subj?.color || '#D97706' }}
                  />
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    {ex.title}
                  </span>
                  <span aria-hidden="true" className="text-slate-400">
                    ·
                  </span>
                  <span
                    className={`font-mono tabular-nums font-medium ${
                      left <= 5
                        ? 'text-rose-600 dark:text-rose-400'
                        : 'text-amber-600 dark:text-amber-400'
                    }`}
                  >
                    {label}
                  </span>
                  <button
                    type="button"
                    onClick={() => onDeleteExam(ex.id)}
                    className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 ml-0.5 cursor-pointer"
                    aria-label={`Remove ${ex.title} countdown`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Mobile Horizontal 7-Day Selector (hidden on lg desktop) */}
        <div className="grid grid-cols-7 gap-1 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 py-2 lg:hidden">
          {weekDays.map((d) => {
            const key = toLocalDateKey(d);
            const active = key === selectedMobileDay;
            const isTod = key === todayKey;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelectedMobileDay(key)}
                className={`flex flex-col items-center justify-center rounded-xl py-1.5 text-xs transition-colors cursor-pointer ${
                  active
                    ? 'bg-blue-600 text-white font-semibold'
                    : isTod
                    ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 font-medium'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                <span className="text-[10px]">
                  {d.toLocaleDateString(undefined, { weekday: 'narrow' })}
                </span>
                <span className="font-mono tabular-nums mt-0.5">{d.getDate()}</span>
              </button>
            );
          })}
        </div>

        {/* Desktop 7-Day Column Header */}
        <div className="hidden lg:grid grid-cols-[56px_repeat(7,minmax(0,1fr))] border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 pr-[6px]">
          <div className="border-r border-slate-200 dark:border-slate-800" />
          {weekDays.map((d) => {
            const key = toLocalDateKey(d);
            const isToday = key === todayKey;
            return (
              <div
                key={key}
                className="flex items-center justify-center gap-1.5 py-2 border-r last:border-r-0 border-slate-200 dark:border-slate-800 text-xs"
              >
                <span
                  className={
                    isToday
                      ? 'font-semibold text-blue-600 dark:text-blue-400'
                      : 'text-slate-500 dark:text-slate-400'
                  }
                >
                  {d.toLocaleDateString(undefined, { weekday: 'short' })}
                </span>
                <span
                  className={`font-mono tabular-nums px-1.5 py-0.5 rounded-md ${
                    isToday
                      ? 'bg-blue-600 text-white font-semibold'
                      : 'text-slate-800 dark:text-slate-200 font-medium'
                  }`}
                >
                  {d.getDate()}
                </span>
              </div>
            );
          })}
        </div>

        {/* Scrollable Timeline Grid */}
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-[52px_minmax(0,1fr)] lg:grid-cols-[56px_repeat(7,minmax(0,1fr))]">
            {/* Time gutter */}
            <div className="border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 select-none">
              {hoursList.map((hr) => (
                <div
                  key={hr}
                  style={{ height: `${HOUR_HEIGHT}px` }}
                  className="relative border-b border-slate-100 dark:border-slate-800/70 pr-2 text-right"
                >
                  <span
                    className={`text-[10px] font-mono tabular-nums text-slate-400 dark:text-slate-500 inline-block ${
                      hr === 0 ? 'mt-0.5' : '-mt-2'
                    }`}
                  >
                    {String(hr).padStart(2, '0')}:00
                  </span>
                </div>
              ))}
            </div>

            {/* Mobile Single-Day Column */}
            <div
              onPointerDown={(e) => handleColumnPointerDown(e, selectedMobileDay)}
              onClick={(e) => handleEmptySlotClick(e, selectedMobileDay)}
              className="relative lg:hidden bg-white dark:bg-slate-950"
              style={{ height: `${TOTAL_HOURS * HOUR_HEIGHT}px` }}
            >
              {renderDayColumnContent(selectedMobileDay)}
            </div>

            {/* Desktop 7-Day Columns */}
            {weekDays.map((d) => {
              const dateKey = toLocalDateKey(d);
              return (
                <div
                  key={dateKey}
                  onPointerDown={(e) => handleColumnPointerDown(e, dateKey)}
                  onDragOver={(e) => handleColumnDragOver(e, dateKey)}
                  onDragLeave={() => setDragPreview(null)}
                  onDrop={(e) => handleColumnDrop(e, dateKey)}
                  onClick={(e) => handleEmptySlotClick(e, dateKey)}
                  style={{ height: `${TOTAL_HOURS * HOUR_HEIGHT}px` }}
                  className={`relative hidden lg:block border-r last:border-r-0 border-slate-200 dark:border-slate-800 ${
                    dateKey === todayKey
                      ? 'bg-blue-50/20 dark:bg-blue-950/10'
                      : 'bg-white dark:bg-slate-950'
                  }`}
                >
                  {renderDayColumnContent(dateKey)}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Block Detail / Edit Modal */}
      {selectedBlock && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/50 backdrop-blur-xs p-0 sm:p-4">
          <div className="w-full max-w-sm rounded-t-3xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <input
                  type="text"
                  value={editingBlockTitle}
                  onChange={(e) => setEditingBlockTitle(e.target.value)}
                  onBlur={() => {
                    const trimmed = editingBlockTitle.trim();
                    if (trimmed && trimmed !== selectedBlock.title) {
                      onUpdateBlock(selectedBlock.id, { title: trimmed });
                      setSelectedBlock({ ...selectedBlock, title: trimmed });
                    } else {
                      setEditingBlockTitle(selectedBlock.title);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      (e.currentTarget as HTMLInputElement).blur();
                    } else if (e.key === 'Escape') {
                      setEditingBlockTitle(selectedBlock.title);
                      (e.currentTarget as HTMLInputElement).blur();
                    }
                  }}
                  aria-label="Study block title"
                  className="w-full rounded-lg border border-transparent hover:border-slate-200 dark:hover:border-slate-700 focus:border-blue-500 focus:bg-slate-50 dark:focus:bg-slate-950 bg-transparent px-1.5 py-0.5 -ml-1.5 text-base font-semibold text-slate-900 dark:text-slate-100 outline-none transition-colors"
                />
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono tabular-nums">
                  {formatShortDate(selectedBlock.date)} ·{' '}
                  {formatMinutesAsClock(selectedBlock.startMinutes)}–
                  {formatMinutesAsClock(
                    selectedBlock.startMinutes + selectedBlock.durationMinutes
                  )}{' '}
                  · {formatDurationCompact(selectedBlock.durationMinutes)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedBlock(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="edit-block-subject"
                className="block text-xs font-medium text-slate-600 dark:text-slate-300"
              >
                Subject
              </label>
              <select
                id="edit-block-subject"
                value={selectedBlock.subjectId}
                onChange={(e) => {
                  const nextSubjectId = e.target.value;
                  onUpdateBlock(selectedBlock.id, { subjectId: nextSubjectId });
                  setSelectedBlock({ ...selectedBlock, subjectId: nextSubjectId });
                }}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs font-medium text-slate-900 dark:text-slate-100"
              >
                <option value="">No Subject</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                Planned Duration
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const next = Math.max(15, selectedBlock.durationMinutes - 15);
                    onUpdateBlock(selectedBlock.id, { durationMinutes: next });
                    setSelectedBlock({ ...selectedBlock, durationMinutes: next });
                  }}
                  className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 py-2 text-xs font-mono font-medium hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  -15m
                </button>
                <span className="px-3 text-sm font-mono tabular-nums font-semibold">
                  {formatDurationCompact(selectedBlock.durationMinutes)}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const next = Math.min(
                      END_HOUR * 60 - selectedBlock.startMinutes,
                      selectedBlock.durationMinutes + 15
                    );
                    onUpdateBlock(selectedBlock.id, { durationMinutes: next });
                    setSelectedBlock({ ...selectedBlock, durationMinutes: next });
                  }}
                  className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 py-2 text-xs font-mono font-medium hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  +15m
                </button>
              </div>
            </div>

            {/* Manual Actual Focused Minutes Editor */}
            {(() => {
              const modalActual = Math.max(0, selectedBlock.actualMinutes || 0);
              const modalPlanned = Math.max(15, selectedBlock.durationMinutes);
              const modalPct = Math.min(100, Math.round((modalActual / modalPlanned) * 100));
              const modalColor = subjectMap.get(selectedBlock.subjectId)?.color || '#2563EB';
              const applyActual = (nextVal: number) => {
                const clamped = Math.max(0, Math.min(720, Math.round(nextVal)));
                const nextCompleted =
                  clamped >= selectedBlock.durationMinutes
                    ? true
                    : selectedBlock.completed && clamped < selectedBlock.durationMinutes
                    ? false
                    : selectedBlock.completed;
                onUpdateBlock(selectedBlock.id, {
                  actualMinutes: clamped,
                  completed: nextCompleted,
                });
                setSelectedBlock({
                  ...selectedBlock,
                  actualMinutes: clamped,
                  completed: nextCompleted,
                });
              };
              return (
                <div className="space-y-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 p-3">
                  <div className="flex items-center justify-between text-xs">
                    <label
                      htmlFor="block-actual-minutes"
                      className="font-medium text-slate-700 dark:text-slate-300"
                    >
                      Actual Focused Time
                    </label>
                    <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                      {modalActual >= modalPlanned
                        ? `✓ ${modalActual}m${modalActual > modalPlanned ? ` (+${modalActual - modalPlanned}m)` : ''}`
                        : `${modalActual}m / ${modalPlanned}m`}
                    </span>
                  </div>

                  <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-200"
                      style={{ width: `${modalPct}%`, backgroundColor: modalColor }}
                    />
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => applyActual(modalActual - 5)}
                      className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-mono font-medium hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      -5m
                    </button>
                    <div className="relative flex-1">
                      <input
                        id="block-actual-minutes"
                        type="number"
                        min={0}
                        max={720}
                        step={1}
                        value={modalActual}
                        onChange={(e) => applyActual(Number(e.target.value) || 0)}
                        className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 pr-8 text-center text-xs font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100"
                      />
                      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] font-mono text-slate-400">
                        m
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => applyActual(modalActual + 5)}
                      className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-mono font-medium hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      +5m
                    </button>
                  </div>
                </div>
              );
            })()}

            <div className="flex flex-wrap items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  onStartTimerForBlock(selectedBlock);
                  setSelectedBlock(null);
                }}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 py-2.5 text-xs font-medium text-white cursor-pointer"
              >
                <Play className="w-3.5 h-3.5" />
                Start Timer
              </button>

              <button
                type="button"
                onClick={() => {
                  onUpdateBlock(selectedBlock.id, { completed: !selectedBlock.completed });
                  setSelectedBlock(null);
                }}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 px-3.5 py-2.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                {selectedBlock.completed ? 'Undo' : 'Done'}
              </button>

              <button
                type="button"
                onClick={() => {
                  onDeleteBlock(selectedBlock.id);
                  setSelectedBlock(null);
                }}
                className="inline-flex items-center justify-center rounded-xl border border-rose-200 dark:border-rose-900/60 p-2.5 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                aria-label="Remove block"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Create Time Block Modal */}
      {creatingSlot && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/50 backdrop-blur-xs p-0 sm:p-4">
          <form
            onSubmit={handleCreateSlotSubmit}
            className="w-full max-w-sm rounded-t-3xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                New Study Block
              </h3>
              <button
                type="button"
                onClick={() => setCreatingSlot(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs font-mono tabular-nums text-slate-500">
              {formatShortDate(creatingSlot.date)} ·{' '}
              {formatMinutesAsClock(creatingSlot.startMinutes)}–
              {formatMinutesAsClock(creatingSlot.startMinutes + newBlockDuration)}
            </p>
            <div className="space-y-3">
              <input
                type="text"
                autoFocus
                required
                value={newBlockTitle}
                onChange={(e) => setNewBlockTitle(e.target.value)}
                placeholder="What will you study?"
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
              />
              <div className="grid grid-cols-2 gap-3">
                <select
                  value={newBlockSubjectId}
                  onChange={(e) => setNewBlockSubjectId(e.target.value)}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                >
                  <option value="">No Subject</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <select
                  value={newBlockDuration}
                  onChange={(e) => setNewBlockDuration(Number(e.target.value))}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono text-slate-900 dark:text-slate-100"
                >
                  {Array.from(
                    new Set([15, 30, 45, 60, 75, 90, 120, 150, 180, newBlockDuration])
                  )
                    .sort((a, b) => a - b)
                    .map((m) => (
                      <option key={m} value={m}>
                        {formatDurationCompact(m)}
                      </option>
                    ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCreatingSlot(null)}
                className="rounded-lg border border-slate-200 dark:border-slate-700 px-3.5 py-2 text-xs font-medium cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-blue-600 hover:bg-blue-700 px-4 py-2 text-xs font-medium text-white cursor-pointer"
              >
                Create Block
              </button>
            </div>
          </form>
        </div>
      )}

      {/* External Google Calendar Event Detail / Convert Modal */}
      {selectedGcalEvent && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/50 backdrop-blur-xs p-0 sm:p-4">
          <form
            onSubmit={handleConvertGcalEventSubmit}
            className="w-full max-w-sm rounded-t-3xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  <Lock className="w-3 h-3" />
                  <span>{selectedGcalEvent.calendarName || 'Google Calendar Event'}</span>
                </div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mt-1">
                  {selectedGcalEvent.summary}
                </h3>
                <p className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400 mt-1">
                  {formatShortDate(selectedGcalEvent.date)} ·{' '}
                  {selectedGcalEvent.isAllDay
                    ? 'All day'
                    : `${formatMinutesAsClock(selectedGcalEvent.startMinutes)}–${formatMinutesAsClock(
                        selectedGcalEvent.startMinutes + selectedGcalEvent.durationMinutes
                      )} · ${formatDurationCompact(selectedGcalEvent.durationMinutes)}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedGcalEvent(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              External Google Calendar events stay separate from your task backlog. Convert this event below if you want to track it as a study block and linked task.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                  Subject
                </label>
                <select
                  value={gcalConvertSubjectId}
                  onChange={(e) => setGcalConvertSubjectId(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs font-medium text-slate-900 dark:text-slate-100"
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
                  Duration
                </label>
                <select
                  value={gcalConvertDuration}
                  onChange={(e) => setGcalConvertDuration(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs font-mono text-slate-900 dark:text-slate-100"
                >
                  {Array.from(
                    new Set([15, 30, 45, 60, 75, 90, 120, 150, 180, gcalConvertDuration])
                  )
                    .sort((a, b) => a - b)
                    .map((m) => (
                      <option key={m} value={m}>
                        {formatDurationCompact(m)}
                      </option>
                    ))}
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              {selectedGcalEvent.htmlLink ? (
                <a
                  href={selectedGcalEvent.htmlLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open in Google</span>
                </a>
              ) : (
                <span />
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedGcalEvent(null)}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 px-3.5 py-2 text-xs font-medium text-white cursor-pointer"
                >
                  <CheckSquare className="w-3.5 h-3.5" />
                  <span>Convert to Study Block &amp; Task</span>
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Pin Exam Countdown Modal */}
      {showExamModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/50 backdrop-blur-xs p-0 sm:p-4">
          <form
            onSubmit={handleAddExamSubmit}
            className="w-full max-w-sm rounded-t-3xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Pin Exam Countdown
              </h3>
              <button
                type="button"
                onClick={() => setShowExamModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              <input
                type="text"
                required
                value={examTitle}
                onChange={(e) => setExamTitle(e.target.value)}
                placeholder="e.g., Physics Final Exam"
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
              />
              <div className="grid grid-cols-2 gap-3">
                <select
                  value={examSubjectId}
                  onChange={(e) => setExamSubjectId(e.target.value)}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                >
                  <option value="">No Subject</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <input
                  type="date"
                  required
                  value={examDate}
                  onChange={(e) => setExamDate(e.target.value)}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowExamModal(false)}
                className="rounded-lg border border-slate-200 dark:border-slate-700 px-3.5 py-2 text-xs font-medium cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-blue-600 hover:bg-blue-700 px-4 py-2 text-xs font-medium text-white cursor-pointer"
              >
                Pin Banner
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
