import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Calendar,
  CheckSquare,
  Timer as TimerIcon,
  BarChart3,
  RefreshCw,
  Sun,
  Moon,
  Cloud,
  CloudOff,
} from 'lucide-react';
import type {
  ActiveTimerSnapshot,
  CalendarBlock,
  ExamCountdown,
  GoogleCalendarEventOverlay,
  MainTab,
  Priority,
  RepeatRule,
  StudyDatabase,
  StudySession,
  SyncStatusInfo,
  TaskMetadata,
  TimerMode,
} from './types';
import {
  addDays,
  formatRelativeTime,
  getWeekStart,
  toLocalDateKey,
} from './utils/dateUtils';
import { computeNextDueDate, normalizeRepeatRule } from './utils/recurrence';
import { createEmptyDatabase } from './utils/seedData';
import { playCompletionChime } from './utils/sound';
import {
  clearAccessToken,
  fetchGoogleCalendarOverlay,
  fetchUserCalendarEmail,
  getAccessToken,
  getSavedClientId,
  hasValidAccessToken,
  overwriteDriveSyncFile,
  parseOAuthCallbackFromHash,
  performFullGoogleSync,
  redirectToGoogleOAuth,
  saveClientId,
} from './services/googleSync';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { OfflineIndicator, PWAInstallButton } from './components/PWAInstallButton';
import { GoogleSetupModal } from './components/GoogleSetupModal';
import { TimeBlockingCalendar } from './components/TimeBlockingCalendar';
import { TaskManagerView } from './components/TaskManagerView';
import {
  SessionCompleteModal,
  StudyTimerDockedBar,
  StudyTimerFocusView,
} from './components/StudyTimer';
import { AnalyticsDashboard } from './components/AnalyticsDashboard';

const DB_STORAGE_KEY = 'cadence_study_db_v1';
const TIMER_STORAGE_KEY = 'cadence_active_timer_v1';

function loadDatabase(): StudyDatabase {
  try {
    const raw = localStorage.getItem(DB_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as StudyDatabase;
      if (parsed && Array.isArray(parsed.subjects) && parsed.tasks_metadata) {
        return parsed;
      }
    }
  } catch {
    // Fallback to empty database
  }
  return createEmptyDatabase();
}

function loadInitialTimer(db: StudyDatabase): ActiveTimerSnapshot {
  try {
    const raw = localStorage.getItem(TIMER_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ActiveTimerSnapshot;
      if (parsed && parsed.mode) {
        return {
          ...parsed,
          subjectId: parsed.subjectId || '',
        };
      }
    }
  } catch {
    // Ignore parse error
  }
  const firstSubj = db.subjects[0];
  return {
    mode: 'pomodoro_25',
    phase: 'focus',
    status: 'idle',
    startedAtMs: null,
    accumulatedMs: 0,
    targetDurationMs: 25 * 60 * 1000,
    subjectId: firstSubj?.id || '',
    title: firstSubj ? `${firstSubj.name} Deep Focus` : 'Focus Session',
  };
}

function computeElapsedMs(t: ActiveTimerSnapshot): number {
  if (t.status === 'running' && t.startedAtMs !== null) {
    return Math.max(0, t.accumulatedMs + (Date.now() - t.startedAtMs));
  }
  return Math.max(0, t.accumulatedMs);
}

export default function App() {
  const isOnline = useOnlineStatus();
  const [db, setDb] = useState<StudyDatabase>(() => loadDatabase());
  const [activeTab, setActiveTab] = useState<MainTab>('workspace');
  const [weekStart, setWeekStart] = useState<Date>(() => getWeekStart(new Date()));

  const [timer, setTimer] = useState<ActiveTimerSnapshot>(() => loadInitialTimer(db));
  const [elapsedMs, setElapsedMs] = useState<number>(() => computeElapsedMs(timer));
  const [focusOverlayOpen, setFocusOverlayOpen] = useState(false);
  const [showLogModal, setShowLogModal] = useState(false);

  const [showSetupModal, setShowSetupModal] = useState(false);
  const [clientId, setClientId] = useState<string>(() => getSavedClientId());
  const [isGoogleConnected, setIsGoogleConnected] = useState<boolean>(() => hasValidAccessToken());
  const [googleEvents, setGoogleEvents] = useState<GoogleCalendarEventOverlay[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatusInfo>({
    state: 'local',
    lastSyncedAt: null,
    remoteFileId: null,
    remoteModifiedTime: null,
    userEmail: null,
  });

  const dirtyRef = useRef(false);
  const debounceTimerRef = useRef<number | null>(null);
  const dbRef = useRef(db);
  dbRef.current = db;
  const syncStatusRef = useRef(syncStatus);
  syncStatusRef.current = syncStatus;

  // Apply light/dark theme to <html>
  useEffect(() => {
    const isDark = db.settings.theme === 'dark';
    document.documentElement.classList.toggle('dark', isDark);
  }, [db.settings.theme]);

  // Persist DB to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(DB_STORAGE_KEY, JSON.stringify(db));
    } catch {
      // Ignore storage quota warnings
    }
  }, [db]);

  // Persist Timer Snapshot to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(TIMER_STORAGE_KEY, JSON.stringify(timer));
    } catch {
      // Ignore storage errors
    }
  }, [timer]);

  // Sync trigger helper
  const runSync = useCallback(
    async (explicitToken?: string) => {
      const token = explicitToken || getAccessToken();
      if (!token) return;
      if (!navigator.onLine) {
        setSyncStatus((prev) => ({ ...prev, state: 'offline' }));
        return;
      }

      setSyncStatus((prev) => ({ ...prev, state: 'syncing', errorMessage: undefined }));
      try {
        const weekEnd = addDays(weekStart, 6);
        const result = await performFullGoogleSync({
          token,
          localDb: dbRef.current,
          knownRemoteFileId: syncStatusRef.current.remoteFileId,
          knownRemoteModifiedTime: syncStatusRef.current.remoteModifiedTime,
          hasPendingLocalEdits: dirtyRef.current,
          weekStart,
          weekEnd,
        });

        dirtyRef.current = false;
        setDb(result.mergedDb);
        setGoogleEvents(result.calendarEvents);
        setSyncStatus((prev) => ({
          ...prev,
          state: 'synced',
          lastSyncedAt: new Date().toISOString(),
          remoteFileId: result.remoteFileId,
          remoteModifiedTime: result.remoteModifiedTime,
          errorMessage: undefined,
        }));
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Google sync failed.';
        if (msg.toLowerCase().includes('expired')) {
          setIsGoogleConnected(false);
        }
        setSyncStatus((prev) => ({
          ...prev,
          state: 'error',
          errorMessage: msg,
        }));
      }
    },
    [weekStart]
  );

  // Helper to update DB and schedule 10-second debounced Drive sync
  const mutateDb = useCallback(
    (updater: (prev: StudyDatabase) => StudyDatabase, syncImmediately = false) => {
      dirtyRef.current = true;
      setDb((prev) => {
        const next = updater(prev);
        return {
          ...next,
          modifiedTime: new Date().toISOString(),
        };
      });

      if (debounceTimerRef.current) {
        window.clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }

      if (hasValidAccessToken()) {
        if (syncImmediately) {
          setTimeout(() => void runSync(), 100);
        } else {
          debounceTimerRef.current = window.setTimeout(() => {
            void runSync();
          }, 10_000);
        }
      }
    },
    [runSync]
  );

  // Refresh Google Calendar overlay when switching weeks while connected
  useEffect(() => {
    const token = getAccessToken();
    if (!isGoogleConnected || !token) return;
    const weekEnd = addDays(weekStart, 6);
    fetchGoogleCalendarOverlay(token, weekStart, weekEnd)
      .then((evs) => setGoogleEvents(evs))
      .catch(() => {
        // Handled on next full sync
      });
  }, [weekStart, isGoogleConnected]);

  // Parse OAuth 2.0 implicit flow access_token from window.location.hash on page load
  useEffect(() => {
    const { accessToken, error } = parseOAuthCallbackFromHash();
    if (error) {
      setSyncStatus((prev) => ({
        ...prev,
        state: 'error',
        errorMessage: error,
      }));
      setShowSetupModal(true);
      return;
    }

    if (accessToken) {
      setIsGoogleConnected(true);
      void (async () => {
        const email = await fetchUserCalendarEmail(accessToken);
        setSyncStatus((prev) => ({ ...prev, userEmail: email }));
        await runSync(accessToken);
      })();
    }
    // Run once on initial mount to handle OAuth redirect callback
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Connect via full-page Google OAuth 2.0 implicit redirect flow
  const handleGoogleConnect = async () => {
    if (!clientId.trim()) {
      setShowSetupModal(true);
      return;
    }
    setSyncStatus((prev) => ({ ...prev, state: 'connecting', errorMessage: undefined }));
    try {
      redirectToGoogleOAuth(clientId);
    } catch (err) {
      setSyncStatus((prev) => ({
        ...prev,
        state: 'error',
        errorMessage: err instanceof Error ? err.message : 'Authorization failed.',
      }));
    }
  };

  const handleGoogleDisconnect = () => {
    clearAccessToken();
    setIsGoogleConnected(false);
    setGoogleEvents([]);
    setSyncStatus({
      state: 'local',
      lastSyncedAt: null,
      remoteFileId: null,
      remoteModifiedTime: null,
      userEmail: null,
    });
  };

  // Timestamp-accurate Date.now() Timer Loop + visibilitychange wakeup
  useEffect(() => {
    const tick = () => {
      const currentElapsed = computeElapsedMs(timer);
      setElapsedMs(currentElapsed);

      if (
        timer.status === 'running' &&
        timer.mode !== 'flowtime' &&
        timer.targetDurationMs > 0 &&
        currentElapsed >= timer.targetDurationMs
      ) {
        if (dbRef.current.settings.soundEnabled) {
          playCompletionChime();
        }
        if (timer.phase === 'focus') {
          setTimer((prev) => ({
            ...prev,
            status: 'paused',
            startedAtMs: null,
            accumulatedMs: prev.targetDurationMs,
          }));
          setShowLogModal(true);
        } else {
          // Break finished -> reset to focus mode
          const focusMins = dbRef.current.settings.pomodoroPreset === '50_10' ? 50 : 25;
          setTimer((prev) => ({
            ...prev,
            phase: 'focus',
            status: 'idle',
            startedAtMs: null,
            accumulatedMs: 0,
            targetDurationMs: focusMins * 60 * 1000,
          }));
        }
      }
    };

    tick();
    if (timer.status !== 'running') return;

    const intervalId = window.setInterval(tick, 250);
    const handleWakeup = () => tick();
    window.addEventListener('focus', handleWakeup);
    document.addEventListener('visibilitychange', handleWakeup);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleWakeup);
      document.removeEventListener('visibilitychange', handleWakeup);
    };
  }, [timer]);

  // Timer actions
  const handleStartOrResumeTimer = () => {
    setTimer((prev) => {
      if (prev.status === 'running') return prev;
      return {
        ...prev,
        status: 'running',
        startedAtMs: Date.now(),
      };
    });
  };

  const handlePauseTimer = () => {
    setTimer((prev) => {
      if (prev.status !== 'running' || prev.startedAtMs === null) return prev;
      const segment = Date.now() - prev.startedAtMs;
      return {
        ...prev,
        status: 'paused',
        startedAtMs: null,
        accumulatedMs: prev.accumulatedMs + segment,
      };
    });
  };

  const handleResetTimer = () => {
    setTimer((prev) => ({
      ...prev,
      status: 'idle',
      startedAtMs: null,
      accumulatedMs: 0,
    }));
    setElapsedMs(0);
  };

  const handleSelectTimerMode = (mode: TimerMode) => {
    const presetTarget =
      mode === 'pomodoro_25'
        ? 25 * 60 * 1000
        : mode === 'pomodoro_50'
        ? 50 * 60 * 1000
        : mode === 'block'
        ? 60 * 60 * 1000
        : 0;
    setTimer((prev) => ({
      ...prev,
      mode,
      phase: 'focus',
      status: 'idle',
      startedAtMs: null,
      accumulatedMs: 0,
      targetDurationMs: presetTarget,
    }));
    setElapsedMs(0);
  };

  const handleSwitchToBreak = () => {
    const breakMins = timer.mode === 'pomodoro_50' ? 10 : 5;
    setTimer((prev) => ({
      ...prev,
      phase: 'break',
      status: 'running',
      startedAtMs: Date.now(),
      accumulatedMs: 0,
      targetDurationMs: breakMins * 60 * 1000,
    }));
  };

  const startTimerForTask = (task: TaskMetadata) => {
    setTimer({
      mode: db.settings.pomodoroPreset === '50_10' ? 'pomodoro_50' : 'pomodoro_25',
      phase: 'focus',
      status: 'running',
      startedAtMs: Date.now(),
      accumulatedMs: 0,
      targetDurationMs:
        (db.settings.pomodoroPreset === '50_10' ? 50 : 25) * 60 * 1000,
      taskId: task.google_task_id,
      subjectId: task.subjectId,
      title: task.title,
    });
    setFocusOverlayOpen(true);
  };

  const startTimerForBlock = (block: CalendarBlock) => {
    setTimer({
      mode: 'block',
      phase: 'focus',
      status: 'running',
      startedAtMs: Date.now(),
      accumulatedMs: 0,
      targetDurationMs: block.durationMinutes * 60 * 1000,
      taskId: block.taskId,
      subjectId: block.subjectId,
      title: block.title,
      calendarBlockId: block.id,
    });
    setFocusOverlayOpen(true);
  };

  const handleSaveSession = (rating: 1 | 2 | 3 | 4 | 5, notes: string) => {
    const totalMs = computeElapsedMs(timer);
    const durationSeconds = Math.max(60, Math.round(totalMs / 1000));
    const endedAt = new Date();
    const startedAt = new Date(endedAt.getTime() - durationSeconds * 1000);
    const loggedMins = Math.max(1, Math.round(durationSeconds / 60));

    const newSession: StudySession = {
      id: `sess-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      taskId: timer.taskId,
      subjectId: timer.subjectId,
      title: timer.title,
      mode: timer.mode,
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      durationSeconds,
      focusRating: rating,
      notes: notes || undefined,
      calendarBlockId: timer.calendarBlockId,
    };

    mutateDb((prev) => {
      const nextTasks = { ...prev.tasks_metadata };
      if (timer.taskId && nextTasks[timer.taskId]) {
        nextTasks[timer.taskId] = {
          ...nextTasks[timer.taskId],
          logged_minutes: (nextTasks[timer.taskId].logged_minutes || 0) + loggedMins,
          updatedAt: new Date().toISOString(),
        };
      }
      const nextBlocks = timer.calendarBlockId
        ? prev.calendar_blocks.map((b) =>
            b.id === timer.calendarBlockId
              ? { ...b, completed: true, updatedAt: new Date().toISOString() }
              : b
          )
        : prev.calendar_blocks;

      return {
        ...prev,
        tasks_metadata: nextTasks,
        calendar_blocks: nextBlocks,
        study_sessions: [newSession, ...prev.study_sessions],
      };
    }, true);

    setShowLogModal(false);
    setTimer((prev) => ({
      ...prev,
      status: 'idle',
      startedAtMs: null,
      accumulatedMs: 0,
    }));
    setElapsedMs(0);
  };

  // Task CRUD
  const handleCreateTask = (input: {
    title: string;
    subjectId: string;
    estimatedMinutes: number;
    priority: Priority;
    due?: string;
    notes?: string;
    repeat?: RepeatRule;
  }) => {
    const id = `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const nowIso = new Date().toISOString();
    const cleanRepeat = normalizeRepeatRule(input.repeat);
    mutateDb((prev) => ({
      ...prev,
      tasks_metadata: {
        ...prev.tasks_metadata,
        [id]: {
          google_task_id: id,
          subjectId: input.subjectId,
          title: input.title,
          notes: input.notes,
          due: input.due,
          status: 'needsAction',
          estimated_minutes: input.estimatedMinutes,
          logged_minutes: 0,
          priority: input.priority,
          repeat: cleanRepeat,
          updatedAt: nowIso,
        },
      },
    }));
  };

  const handleUpdateTask = (taskId: string, patch: Partial<TaskMetadata>) => {
    const currentTask = dbRef.current.tasks_metadata[taskId];
    const hasRepeatPatch = Object.prototype.hasOwnProperty.call(patch, 'repeat');
    const targetRepeat = normalizeRepeatRule(
      hasRepeatPatch ? patch.repeat : currentTask?.repeat
    );
    const willRollForward =
      !!currentTask &&
      patch.status === 'completed' &&
      currentTask.status !== 'completed' &&
      !!targetRepeat &&
      !currentTask.nextOccurrenceSpawned;

    mutateDb((prev) => {
      const existing = prev.tasks_metadata[taskId];
      if (!existing) return prev;

      const nowIso = new Date().toISOString();
      const effectiveRepeat = normalizeRepeatRule(
        hasRepeatPatch ? patch.repeat : existing.repeat
      );
      const isCompletingNow =
        patch.status === 'completed' && existing.status !== 'completed';
      const shouldSpawnNext =
        isCompletingNow && !!effectiveRepeat && !existing.nextOccurrenceSpawned;

      const updatedExisting: TaskMetadata = {
        ...existing,
        ...patch,
        repeat: effectiveRepeat,
        nextOccurrenceSpawned: shouldSpawnNext
          ? true
          : existing.nextOccurrenceSpawned,
        updatedAt: nowIso,
      };

      const nextTasks: Record<string, TaskMetadata> = {
        ...prev.tasks_metadata,
        [taskId]: updatedExisting,
      };

      if (shouldSpawnNext && effectiveRepeat) {
        const nextId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const nextDue = computeNextDueDate(updatedExisting.due, effectiveRepeat);
        nextTasks[nextId] = {
          google_task_id: nextId,
          subjectId: updatedExisting.subjectId,
          title: updatedExisting.title,
          notes: updatedExisting.notes,
          due: nextDue,
          status: 'needsAction',
          estimated_minutes: updatedExisting.estimated_minutes,
          logged_minutes: 0,
          priority: updatedExisting.priority,
          repeat: effectiveRepeat,
          updatedAt: nowIso,
        };
      }

      return {
        ...prev,
        tasks_metadata: nextTasks,
      };
    }, willRollForward);
  };

  const handleDeleteTask = (taskId: string) => {
    mutateDb((prev) => {
      const existing = prev.tasks_metadata[taskId];
      if (!existing) return prev;
      const nextTasks = { ...prev.tasks_metadata };
      if (existing.googleTaskListId) {
        // Tombstone so Google Tasks sync removes it remotely
        nextTasks[taskId] = {
          ...existing,
          deleted: true,
          updatedAt: new Date().toISOString(),
        };
      } else {
        delete nextTasks[taskId];
      }
      return {
        ...prev,
        tasks_metadata: nextTasks,
      };
    });
  };

  // Calendar Block CRUD
  const handleCreateBlock = (blockInput: Omit<CalendarBlock, 'id' | 'updatedAt'>) => {
    const newBlock: CalendarBlock = {
      ...blockInput,
      id: `blk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      updatedAt: new Date().toISOString(),
    };
    mutateDb((prev) => ({
      ...prev,
      calendar_blocks: [...prev.calendar_blocks, newBlock],
    }));
  };

  const handleUpdateBlock = (blockId: string, patch: Partial<CalendarBlock>) => {
    mutateDb((prev) => ({
      ...prev,
      calendar_blocks: prev.calendar_blocks.map((b) =>
        b.id === blockId ? { ...b, ...patch, updatedAt: new Date().toISOString() } : b
      ),
    }));
  };

  const handleDeleteBlock = (blockId: string) => {
    mutateDb((prev) => ({
      ...prev,
      calendar_blocks: prev.calendar_blocks.filter((b) => b.id !== blockId),
    }));
  };

  const handleScheduleTask = (
    task: TaskMetadata,
    date: string,
    startMinutes: number,
    durationMinutes: number
  ) => {
    handleCreateBlock({
      taskId: task.google_task_id,
      subjectId: task.subjectId,
      title: task.title,
      date,
      startMinutes,
      durationMinutes,
    });
    setActiveTab('workspace');
  };

  // Backup Export / Import
  const handleDownloadBackup = () => {
    const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cadence_study_sync_${toLocalDateKey(new Date())}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportBackup = async (file: File) => {
    const text = await file.text();
    const parsed = JSON.parse(text) as StudyDatabase;
    if (!parsed || !Array.isArray(parsed.subjects) || !parsed.tasks_metadata) {
      throw new Error('File does not match Cadence study_sync.json schema.');
    }
    mutateDb(() => parsed, true);
  };

  const activeSubject = useMemo(
    () => db.subjects.find((s) => s.id === timer.subjectId) || db.subjects[0],
    [db.subjects, timer.subjectId]
  );

  const navItems: Array<{ id: MainTab; label: string; icon: React.ReactNode }> = [
    { id: 'workspace', label: 'Calendar', icon: <Calendar className="w-5 h-5" /> },
    { id: 'tasks', label: 'Tasks', icon: <CheckSquare className="w-5 h-5" /> },
    { id: 'timer', label: 'Timer', icon: <TimerIcon className="w-5 h-5" /> },
    { id: 'analytics', label: 'Stats', icon: <BarChart3 className="w-5 h-5" /> },
  ];

  const syncLabel = !isOnline
    ? 'Offline'
    : syncStatus.state === 'syncing'
    ? 'Syncing...'
    : isGoogleConnected
    ? `Synced · ${formatRelativeTime(syncStatus.lastSyncedAt)}`
    : 'Google Sync';

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* TOP BAR (3-Zone Contract) */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-4 sm:gap-8 h-13 sm:h-14 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md px-4 sm:px-6">
        {/* Zone 1: Single-line brand wordmark */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('workspace');
          }}
          className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0"
        >
          Cadence
        </a>

        {/* Zone 2: Concise single-line navigation links (Desktop) */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
          {navItems.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer border-b-2 ${
                  active
                    ? 'border-blue-600 text-slate-900 dark:text-slate-100 font-semibold'
                    : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Sync Status & Utilities */}
        <div className="flex items-center gap-2 shrink-0">
          <PWAInstallButton compact />

          <button
            type="button"
            onClick={() =>
              mutateDb((prev) => ({
                ...prev,
                settings: {
                  ...prev.settings,
                  theme: prev.settings.theme === 'dark' ? 'light' : 'dark',
                },
              }))
            }
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            title="Toggle light/dark theme"
            aria-label="Toggle theme"
          >
            {db.settings.theme === 'dark' ? (
              <Sun className="w-4 h-4" />
            ) : (
              <Moon className="w-4 h-4" />
            )}
          </button>

          {isGoogleConnected && (
            <button
              type="button"
              onClick={() => void runSync()}
              disabled={syncStatus.state === 'syncing'}
              className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer"
              title="Sync Now with Google Drive, Tasks & Calendar"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 text-blue-600 dark:text-blue-400 ${
                  syncStatus.state === 'syncing' ? 'animate-spin' : ''
                }`}
              />
              <span>Sync Now</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowSetupModal(true)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              isGoogleConnected
                ? 'border border-emerald-200 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                : 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:opacity-90'
            }`}
          >
            {isGoogleConnected ? (
              <Cloud className="w-3.5 h-3.5 shrink-0" />
            ) : (
              <CloudOff className="w-3.5 h-3.5 shrink-0 opacity-80" />
            )}
            <span>{syncLabel}</span>
          </button>
        </div>
      </header>

      {/* MAIN VIEWPORT */}
      <main className="flex-1 pb-28 md:pb-14">
        {activeTab === 'workspace' && (
          <TimeBlockingCalendar
            weekStart={weekStart}
            onChangeWeekStart={setWeekStart}
            subjects={db.subjects}
            tasks={db.tasks_metadata}
            blocks={db.calendar_blocks}
            googleEvents={googleEvents}
            examBanners={db.settings.examBanners}
            onCreateTask={handleCreateTask}
            onCreateBlock={handleCreateBlock}
            onUpdateBlock={handleUpdateBlock}
            onDeleteBlock={handleDeleteBlock}
            onStartTimerForBlock={startTimerForBlock}
            onStartTimerForTask={startTimerForTask}
            onAddExam={(ex: Omit<ExamCountdown, 'id'>) =>
              mutateDb((prev) => ({
                ...prev,
                settings: {
                  ...prev.settings,
                  examBanners: [
                    ...prev.settings.examBanners,
                    { ...ex, id: `exam-${Date.now()}` },
                  ],
                },
              }))
            }
            onDeleteExam={(examId) =>
              mutateDb((prev) => ({
                ...prev,
                settings: {
                  ...prev.settings,
                  examBanners: prev.settings.examBanners.filter((e) => e.id !== examId),
                },
              }))
            }
          />
        )}

        {activeTab === 'tasks' && (
          <TaskManagerView
            subjects={db.subjects}
            tasks={db.tasks_metadata}
            calendarBlocks={db.calendar_blocks}
            onCreateTask={handleCreateTask}
            onUpdateTask={handleUpdateTask}
            onDeleteTask={handleDeleteTask}
            onStartTimerForTask={startTimerForTask}
            onScheduleTask={handleScheduleTask}
            isGoogleConnected={isGoogleConnected}
          />
        )}

        {activeTab === 'timer' && (
          <StudyTimerFocusView
            timer={timer}
            elapsedMs={elapsedMs}
            subjects={db.subjects}
            tasks={db.tasks_metadata}
            soundEnabled={db.settings.soundEnabled}
            onToggleSound={() =>
              mutateDb((prev) => ({
                ...prev,
                settings: {
                  ...prev.settings,
                  soundEnabled: !prev.settings.soundEnabled,
                },
              }))
            }
            onSelectMode={handleSelectTimerMode}
            onSelectContext={(ctx) =>
              setTimer((prev) => ({
                ...prev,
                taskId: ctx.taskId,
                subjectId: ctx.subjectId,
                title: ctx.title,
                calendarBlockId: undefined,
              }))
            }
            onStartOrResume={handleStartOrResumeTimer}
            onPause={handlePauseTimer}
            onReset={handleResetTimer}
            onOpenLogModal={() => {
              handlePauseTimer();
              setShowLogModal(true);
            }}
            onSwitchToBreak={handleSwitchToBreak}
          />
        )}

        {activeTab === 'analytics' && (
          <AnalyticsDashboard
            subjects={db.subjects}
            tasks={db.tasks_metadata}
            blocks={db.calendar_blocks}
            sessions={db.study_sessions}
            dailyGoalMinutes={db.settings.dailyGoalMinutes}
          />
        )}
      </main>

      {/* PERSISTENT DOCKED STUDY TIMER BAR */}
      {activeTab !== 'timer' && !focusOverlayOpen && (
        <StudyTimerDockedBar
          timer={timer}
          elapsedMs={elapsedMs}
          subjects={db.subjects}
          onStartOrResume={handleStartOrResumeTimer}
          onPause={handlePauseTimer}
          onOpenLogModal={() => {
            handlePauseTimer();
            setShowLogModal(true);
          }}
          onExpandFocus={() => setFocusOverlayOpen(true)}
          hideOnMobile={timer.status === 'idle' && elapsedMs === 0}
        />
      )}

      {/* DISTRACTION-FREE FOCUS MODE FULLSCREEN OVERLAY */}
      {focusOverlayOpen && (
        <StudyTimerFocusView
          isFullscreenOverlay
          onCloseFullscreen={() => setFocusOverlayOpen(false)}
          timer={timer}
          elapsedMs={elapsedMs}
          subjects={db.subjects}
          tasks={db.tasks_metadata}
          soundEnabled={db.settings.soundEnabled}
          onToggleSound={() =>
            mutateDb((prev) => ({
              ...prev,
              settings: {
                ...prev.settings,
                soundEnabled: !prev.settings.soundEnabled,
              },
            }))
          }
          onSelectMode={handleSelectTimerMode}
          onSelectContext={(ctx) =>
            setTimer((prev) => ({
              ...prev,
              taskId: ctx.taskId,
              subjectId: ctx.subjectId,
              title: ctx.title,
              calendarBlockId: undefined,
            }))
          }
          onStartOrResume={handleStartOrResumeTimer}
          onPause={handlePauseTimer}
          onReset={handleResetTimer}
          onOpenLogModal={() => {
            handlePauseTimer();
            setShowLogModal(true);
          }}
          onSwitchToBreak={handleSwitchToBreak}
        />
      )}

      {/* MOBILE BOTTOM NAVIGATION BAR */}
      <nav
        aria-label="Mobile navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 grid grid-cols-4 items-center h-16 pb-safe border-t border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md"
      >
        {navItems.map((item) => {
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`flex flex-col items-center justify-center min-h-[44px] py-1.5 transition-colors cursor-pointer ${
                active
                  ? 'text-blue-600 dark:text-blue-400'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              {item.icon}
              <span className="text-[11px] font-medium tracking-tight mt-0.5">
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>

      {/* MODALS & INDICATORS */}
      <GoogleSetupModal
        isOpen={showSetupModal}
        onClose={() => setShowSetupModal(false)}
        clientId={clientId}
        onSaveClientId={(id) => {
          setClientId(id);
          saveClientId(id);
        }}
        isConnected={isGoogleConnected}
        syncStatus={syncStatus}
        onConnect={handleGoogleConnect}
        onDisconnect={handleGoogleDisconnect}
        onSyncNow={() => runSync()}
        onDownloadBackup={handleDownloadBackup}
        onImportBackup={handleImportBackup}
        subjects={db.subjects}
        onAddSubject={(name, color) =>
          mutateDb((prev) => ({
            ...prev,
            subjects: [
              ...prev.subjects,
              {
                id: `subj-${Date.now()}`,
                name,
                color,
                updatedAt: new Date().toISOString(),
              },
            ],
          }))
        }
        onUpdateSubjectColor={(subjId, color) =>
          mutateDb((prev) => ({
            ...prev,
            subjects: prev.subjects.map((s) =>
              s.id === subjId
                ? { ...s, color, updatedAt: new Date().toISOString() }
                : s
            ),
          }))
        }
        onDeleteSubject={(subjId) =>
          mutateDb((prev) => {
            const remaining = prev.subjects.filter((s) => s.id !== subjId);
            const fallbackId = remaining[0]?.id || '';
            const nextTasks: Record<string, TaskMetadata> = {};
            for (const [k, t] of Object.entries(prev.tasks_metadata)) {
              nextTasks[k] = t.subjectId === subjId ? { ...t, subjectId: fallbackId } : t;
            }
            return {
              ...prev,
              subjects: remaining,
              tasks_metadata: nextTasks,
            };
          })
        }
        dailyGoalMinutes={db.settings.dailyGoalMinutes}
        onUpdateDailyGoal={(mins) =>
          mutateDb((prev) => ({
            ...prev,
            settings: { ...prev.settings, dailyGoalMinutes: mins },
          }))
        }
        onResetAllData={async () => {
          if (debounceTimerRef.current) {
            window.clearTimeout(debounceTimerRef.current);
            debounceTimerRef.current = null;
          }
          dirtyRef.current = false;

          const emptyDb = createEmptyDatabase(db.settings.theme);
          setDb(emptyDb);
          setTimer({
            mode: 'pomodoro_25',
            phase: 'focus',
            status: 'idle',
            startedAtMs: null,
            accumulatedMs: 0,
            targetDurationMs: 25 * 60 * 1000,
            subjectId: '',
            title: 'Focus Session',
          });
          setElapsedMs(0);

          try {
            localStorage.setItem(DB_STORAGE_KEY, JSON.stringify(emptyDb));
            localStorage.removeItem(TIMER_STORAGE_KEY);
          } catch {
            // Ignore storage errors
          }

          const token = getAccessToken();
          if (token && navigator.onLine) {
            setSyncStatus((prev) => ({ ...prev, state: 'syncing', errorMessage: undefined }));
            try {
              const saved = await overwriteDriveSyncFile({
                token,
                emptyDb,
                knownRemoteFileId: syncStatusRef.current.remoteFileId,
              });
              setSyncStatus((prev) => ({
                ...prev,
                state: 'synced',
                lastSyncedAt: new Date().toISOString(),
                remoteFileId: saved.remoteFileId,
                remoteModifiedTime: saved.remoteModifiedTime,
                errorMessage: undefined,
              }));
            } catch (err) {
              setSyncStatus((prev) => ({
                ...prev,
                state: 'error',
                errorMessage:
                  err instanceof Error ? err.message : 'Failed to overwrite study_sync.json.',
              }));
            }
          }
        }}
      />

      <SessionCompleteModal
        isOpen={showLogModal}
        title={timer.title}
        subjectName={activeSubject?.name || 'No Subject'}
        durationSeconds={Math.round(elapsedMs / 1000)}
        onSave={handleSaveSession}
        onDiscard={() => {
          setShowLogModal(false);
          handleResetTimer();
        }}
        onCancel={() => setShowLogModal(false)}
      />

      <OfflineIndicator />
    </div>
  );
}
