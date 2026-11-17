import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Calendar,
  CheckSquare,
  Timer as TimerIcon,
  BarChart3,
  RefreshCw,
  Sun,
  Moon,
  Settings,
  AlertCircle,
  X,
  FileText,
  BookOpen,
} from 'lucide-react';
import type {
  ALSubjectKey,
  ActiveTimerSnapshot,
  CalendarBlock,
  ExamCountdown,
  GoogleCalendarEventOverlay,
  MainTab,
  PastPaperRecord,
  Priority,
  RepeatRule,
  StudyDatabase,
  StudySession,
  SyllabusSubtopicProgress,
  SyncSource,
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
  GoogleAuthInteractionRequiredError,
  GoogleCalendarScopeUpgradeRequiredError,
  clearAccessToken,
  createGoogleCalendarEventForBlock,
  createGoogleTaskRemote,
  deleteGoogleCalendarEventById,
  deleteGoogleTaskRemote,
  ensureValidGoogleToken,
  fetchGoogleCalendarOverlay,
  fetchGoogleUserProfile,
  getAccessToken,
  getSavedClientId,
  getStoredUserProfile,
  hasValidAccessToken,
  overwriteDriveSyncFile,
  parseOAuthCallbackFromHash,
  performFullGoogleSync,
  requestInteractiveGoogleToken,
  saveClientId,
  silentRefreshGoogleToken,
  updateGoogleCalendarEventForBlock,
  updateGoogleTaskRemote,
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
import { PapersView } from './components/PapersView';
import { SyllabusView } from './components/SyllabusView';
import {
  AL_SUBJECT_CONFIGS,
  findMatchingUserSubject,
  type RedoQueueEntry,
} from './utils/pastPapers';
import type {
  ResolvedSubtopicItem,
  SyllabusUnitSeed,
} from './utils/syllabusData';

const DB_STORAGE_KEY = 'cadence_study_db_v1';
const TIMER_STORAGE_KEY = 'cadence_active_timer_v1';

function loadDatabase(): StudyDatabase {
  try {
    const raw = localStorage.getItem(DB_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as StudyDatabase;
      if (parsed && Array.isArray(parsed.subjects) && parsed.tasks_metadata) {
        return {
          ...parsed,
          pastPapers: Array.isArray(parsed.pastPapers) ? parsed.pastPapers : [],
          syllabusProgress:
            parsed.syllabusProgress && typeof parsed.syllabusProgress === 'object'
              ? parsed.syllabusProgress
              : {},
        };
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
  const [dismissedReconnectBanner, setDismissedReconnectBanner] = useState(false);
  const [dismissedScopeUpgradeBanner, setDismissedScopeUpgradeBanner] = useState(false);
  const [dismissedErrorBanner, setDismissedErrorBanner] = useState(false);
  const [googleEvents, setGoogleEvents] = useState<GoogleCalendarEventOverlay[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatusInfo>(() => {
    const profile = getStoredUserProfile();
    return {
      state: 'local',
      lastSyncedAt: null,
      remoteFileId: null,
      remoteModifiedTime: null,
      userEmail: profile.email,
      userName: profile.name,
      needsReconnect: false,
      needsCalendarScopeUpgrade: false,
    };
  });

  const dirtyRef = useRef(false);
  const debounceTimerRef = useRef<number | null>(null);
  const dbRef = useRef(db);
  dbRef.current = db;
  const syncStatusRef = useRef(syncStatus);
  syncStatusRef.current = syncStatus;
  const isGoogleConnectedRef = useRef(isGoogleConnected);
  isGoogleConnectedRef.current = isGoogleConnected;

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

  // Sync trigger helper with transparent silent refresh fallback
  const runSync = useCallback(
    async (explicitToken?: string) => {
      if (!navigator.onLine) {
        setSyncStatus((prev) => ({ ...prev, state: 'offline' }));
        return;
      }

      setDismissedErrorBanner(false);
      setSyncStatus((prev) => ({ ...prev, state: 'syncing', errorMessage: undefined }));
      try {
        let token = explicitToken || getAccessToken();
        if (!token) {
          token = await ensureValidGoogleToken();
        }
        if (!token) {
          setSyncStatus((prev) => ({ ...prev, state: 'local' }));
          return;
        }

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

        const profile = getStoredUserProfile();
        dirtyRef.current = false;
        setIsGoogleConnected(true);
        setDismissedReconnectBanner(false);
        setDb(result.mergedDb);
        setGoogleEvents(result.calendarEvents);

        const hasCalErrors = result.calendarSyncErrors.length > 0;
        const calErrorSummary = hasCalErrors
          ? result.calendarSyncErrors.length === 1
            ? result.calendarSyncErrors[0]
            : `${result.calendarSyncErrors.length} Google Calendar sync errors: ${result.calendarSyncErrors[0]}`
          : undefined;

        if (hasCalErrors) {
          setDismissedErrorBanner(false);
        }

        setSyncStatus((prev) => ({
          ...prev,
          state: hasCalErrors ? 'error' : 'synced',
          lastSyncedAt: new Date().toISOString(),
          remoteFileId: result.remoteFileId,
          remoteModifiedTime: result.remoteModifiedTime,
          userEmail: profile.email || prev.userEmail,
          userName: profile.name || prev.userName,
          needsReconnect: false,
          needsCalendarScopeUpgrade: false,
          reconnectReason: undefined,
          errorMessage: calErrorSummary,
        }));
      } catch (err) {
        if (err instanceof GoogleCalendarScopeUpgradeRequiredError) {
          setDismissedScopeUpgradeBanner(false);
          setSyncStatus((prev) => ({
            ...prev,
            state: 'local',
            needsCalendarScopeUpgrade: true,
            errorMessage: undefined,
          }));
          return;
        }
        if (err instanceof GoogleAuthInteractionRequiredError) {
          setIsGoogleConnected(false);
          setDismissedReconnectBanner(false);
          setSyncStatus((prev) => ({
            ...prev,
            state: 'local',
            needsReconnect: true,
            reconnectReason: err.code,
            errorMessage: undefined,
          }));
          return;
        }
        const msg = err instanceof Error ? err.message : 'Google sync failed.';
        setDismissedErrorBanner(false);
        setSyncStatus((prev) => ({
          ...prev,
          state: 'error',
          errorMessage: msg,
        }));
      }
    },
    [weekStart]
  );

  const runCalendarMutation = useCallback(async (fn: (token: string) => Promise<void>) => {
    if (!navigator.onLine) return;
    const canAttempt =
      hasValidAccessToken() ||
      (isGoogleConnectedRef.current &&
        !syncStatusRef.current.needsReconnect &&
        !!getStoredUserProfile().email);
    if (!canAttempt) return;

    try {
      let token = getAccessToken();
      if (!token) {
        token = await ensureValidGoogleToken();
      }
      if (!token) return;
      await fn(token);
    } catch (err) {
      if (err instanceof GoogleCalendarScopeUpgradeRequiredError) {
        setDismissedScopeUpgradeBanner(false);
        setSyncStatus((prev) => ({
          ...prev,
          needsCalendarScopeUpgrade: true,
          errorMessage: undefined,
        }));
        return;
      }
      if (err instanceof GoogleAuthInteractionRequiredError) {
        setIsGoogleConnected(false);
        setDismissedReconnectBanner(false);
        setSyncStatus((prev) => ({
          ...prev,
          state: 'local',
          needsReconnect: true,
          reconnectReason: err.code,
          errorMessage: undefined,
        }));
        return;
      }
      const msg =
        err instanceof Error ? err.message : 'Google Calendar / Tasks sync failed.';
      setDismissedErrorBanner(false);
      setSyncStatus((prev) => ({
        ...prev,
        state: 'error',
        errorMessage: msg,
      }));
    }
  }, []);

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

      const canAttemptSync =
        hasValidAccessToken() ||
        (isGoogleConnectedRef.current &&
          !syncStatusRef.current.needsReconnect &&
          !!getStoredUserProfile().email);

      if (canAttemptSync) {
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

  const pushAndPromoteLocalTask = useCallback(
    (localTask: TaskMetadata) => {
      const localId = localTask.google_task_id;
      const subject = dbRef.current.subjects.find((s) => s.id === localTask.subjectId);

      void runCalendarMutation(async (token) => {
        const created = await createGoogleTaskRemote(token, localTask, subject);
        const latestLocal = dbRef.current.tasks_metadata[localId];

        if (!latestLocal || latestLocal.deleted) {
          await deleteGoogleTaskRemote(token, created.googleTaskListId, created.googleTaskId);
          mutateDb((prev) => {
            const nextTasks = { ...prev.tasks_metadata };
            delete nextTasks[localId];
            return { ...prev, tasks_metadata: nextTasks };
          });
          return;
        }

        const promotedTask: TaskMetadata = {
          ...latestLocal,
          google_task_id: created.googleTaskId,
          googleTaskListId: created.googleTaskListId,
          updatedAt: latestLocal.updatedAt || created.updatedAt,
        };

        mutateDb((prev) => {
          const nextTasks = { ...prev.tasks_metadata };
          delete nextTasks[localId];
          nextTasks[created.googleTaskId] = promotedTask;

          return {
            ...prev,
            subjects: prev.subjects.map((s) =>
              s.id === promotedTask.subjectId && !s.googleTaskListId
                ? { ...s, googleTaskListId: created.googleTaskListId }
                : s
            ),
            tasks_metadata: nextTasks,
            calendar_blocks: prev.calendar_blocks.map((b) =>
              b.taskId === localId ? { ...b, taskId: created.googleTaskId } : b
            ),
            study_sessions: prev.study_sessions.map((sess) =>
              sess.taskId === localId ? { ...sess, taskId: created.googleTaskId } : sess
            ),
          };
        });

        setTimer((prev) =>
          prev.taskId === localId ? { ...prev, taskId: created.googleTaskId } : prev
        );

        // If the task was updated (e.g., completed or renamed) while creation was in flight, push latest fields
        if (
          latestLocal.title !== localTask.title ||
          latestLocal.status !== localTask.status ||
          latestLocal.subjectId !== localTask.subjectId ||
          latestLocal.due !== localTask.due
        ) {
          const latestSubject = dbRef.current.subjects.find(
            (s) => s.id === promotedTask.subjectId
          );
          await updateGoogleTaskRemote(token, promotedTask, latestSubject);
        }
      });
    },
    [mutateDb, runCalendarMutation]
  );

  const syncTaskChangeToGoogleTasks = useCallback(
    (taskSnapshot: TaskMetadata, syncSource: SyncSource = 'task') => {
      if (syncSource === 'google_tasks') return;
      if (!taskSnapshot.googleTaskListId) return;
      const prevTaskId = taskSnapshot.google_task_id;
      const subject = dbRef.current.subjects.find((s) => s.id === taskSnapshot.subjectId);

      void runCalendarMutation(async (token) => {
        const result = await updateGoogleTaskRemote(token, taskSnapshot, subject, {
          syncSource,
        });
        if (
          result.googleTaskId !== prevTaskId ||
          result.googleTaskListId !== taskSnapshot.googleTaskListId
        ) {
          mutateDb((prev) => {
            const current = prev.tasks_metadata[prevTaskId];
            if (!current) return prev;
            const nextTasks = { ...prev.tasks_metadata };
            delete nextTasks[prevTaskId];
            nextTasks[result.googleTaskId] = {
              ...current,
              google_task_id: result.googleTaskId,
              googleTaskListId: result.googleTaskListId,
              updatedAt: result.updatedAt || current.updatedAt,
            };
            return {
              ...prev,
              tasks_metadata: nextTasks,
              calendar_blocks: prev.calendar_blocks.map((b) =>
                b.taskId === prevTaskId ? { ...b, taskId: result.googleTaskId } : b
              ),
              study_sessions: prev.study_sessions.map((sess) =>
                sess.taskId === prevTaskId ? { ...sess, taskId: result.googleTaskId } : sess
              ),
            };
          });
          setTimer((prev) =>
            prev.taskId === prevTaskId ? { ...prev, taskId: result.googleTaskId } : prev
          );
        } else if (result.updatedAt && result.updatedAt !== taskSnapshot.updatedAt) {
          setDb((prev) => {
            const current = prev.tasks_metadata[prevTaskId];
            if (!current || current.updatedAt !== taskSnapshot.updatedAt) return prev;
            return {
              ...prev,
              tasks_metadata: {
                ...prev.tasks_metadata,
                [prevTaskId]: {
                  ...current,
                  updatedAt: result.updatedAt,
                },
              },
            };
          });
        }
      });
    },
    [mutateDb, runCalendarMutation]
  );

  // Refresh Google Calendar overlay when switching weeks while connected
  useEffect(() => {
    if (!isGoogleConnected || !navigator.onLine) return;
    let cancelled = false;
    const weekEnd = addDays(weekStart, 6);

    void (async () => {
      try {
        const token = await ensureValidGoogleToken();
        if (!token || cancelled) return;
        const evs = await fetchGoogleCalendarOverlay(token, weekStart, weekEnd);
        if (!cancelled) {
          setGoogleEvents(evs);
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof GoogleAuthInteractionRequiredError) {
          setIsGoogleConnected(false);
          setDismissedReconnectBanner(false);
          setSyncStatus((prev) => ({
            ...prev,
            state: 'local',
            needsReconnect: true,
            reconnectReason: err.code,
          }));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [weekStart, isGoogleConnected]);

  // Boot session restoration & silent re-authentication (prompt: 'none')
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
        const profile = await fetchGoogleUserProfile(accessToken);
        setSyncStatus((prev) => ({
          ...prev,
          userEmail: profile.email || prev.userEmail,
          userName: profile.name || prev.userName,
          needsReconnect: false,
          reconnectReason: undefined,
        }));
        await runSync(accessToken);
      })();
      return;
    }

    const validToken = getAccessToken();
    const savedProfile = getStoredUserProfile();
    const savedClientId = getSavedClientId();

    if (validToken) {
      // Restored immediately within the 1-hour validity window with zero login clicks
      setIsGoogleConnected(true);
      void (async () => {
        if (!savedProfile.email) {
          const profile = await fetchGoogleUserProfile(validToken);
          setSyncStatus((prev) => ({
            ...prev,
            userEmail: profile.email || prev.userEmail,
            userName: profile.name || prev.userName,
          }));
        }
        if (navigator.onLine) {
          await runSync(validToken);
        }
      })();
      return;
    }

    if (savedProfile.email && savedClientId) {
      if (!navigator.onLine) {
        setSyncStatus((prev) => ({ ...prev, state: 'offline' }));
        return;
      }

      void (async () => {
        try {
          const freshToken = await silentRefreshGoogleToken(savedClientId, savedProfile.email!);
          const updatedProfile = getStoredUserProfile();
          setIsGoogleConnected(true);
          setDismissedReconnectBanner(false);
          setSyncStatus((prev) => ({
            ...prev,
            userEmail: updatedProfile.email || prev.userEmail,
            userName: updatedProfile.name || prev.userName,
            needsReconnect: false,
            reconnectReason: undefined,
            errorMessage: undefined,
          }));
          await runSync(freshToken);
        } catch (err) {
          if (err instanceof GoogleAuthInteractionRequiredError) {
            setIsGoogleConnected(false);
            setDismissedReconnectBanner(false);
            setSyncStatus((prev) => ({
              ...prev,
              state: 'local',
              needsReconnect: true,
              reconnectReason: err.code,
              errorMessage: undefined,
            }));
          }
        }
      })();
    }
    // Run once on initial mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Connect / Reconnect via GIS initTokenClient popup flow
  const handleGoogleConnect = async (clientIdOverride?: string) => {
    const resolvedClientId = (clientIdOverride ?? clientId ?? getSavedClientId()).trim();
    if (!resolvedClientId) {
      setShowSetupModal(true);
      return;
    }

    setSyncStatus((prev) => ({ ...prev, state: 'connecting', errorMessage: undefined }));
    try {
      const savedProfile = getStoredUserProfile();
      const result = await requestInteractiveGoogleToken(resolvedClientId, {
        hint: syncStatusRef.current.userEmail || savedProfile.email || undefined,
        prompt: syncStatusRef.current.reconnectReason === 'consent_required' ? 'consent' : undefined,
      });

      setIsGoogleConnected(true);
      setDismissedReconnectBanner(false);
      setDismissedScopeUpgradeBanner(false);
      setSyncStatus((prev) => ({
        ...prev,
        userEmail: result.email || prev.userEmail,
        userName: result.name || prev.userName,
        needsReconnect: false,
        needsCalendarScopeUpgrade: false,
        reconnectReason: undefined,
        errorMessage: undefined,
      }));
      await runSync(result.accessToken);
    } catch (err) {
      setDismissedErrorBanner(false);
      setSyncStatus((prev) => ({
        ...prev,
        state: 'error',
        errorMessage: err instanceof Error ? err.message : 'Authorization failed.',
      }));
    }
  };

  const handleGrantCalendarScopeUpgrade = async () => {
    const resolvedClientId = (clientId || getSavedClientId()).trim();
    if (!resolvedClientId) {
      setShowSetupModal(true);
      return;
    }

    setSyncStatus((prev) => ({ ...prev, state: 'connecting', errorMessage: undefined }));
    try {
      const savedProfile = getStoredUserProfile();
      const result = await requestInteractiveGoogleToken(resolvedClientId, {
        hint: syncStatusRef.current.userEmail || savedProfile.email || undefined,
        prompt: 'consent',
      });

      setIsGoogleConnected(true);
      setDismissedReconnectBanner(false);
      setDismissedScopeUpgradeBanner(false);
      setSyncStatus((prev) => ({
        ...prev,
        userEmail: result.email || prev.userEmail,
        userName: result.name || prev.userName,
        needsReconnect: false,
        needsCalendarScopeUpgrade: false,
        reconnectReason: undefined,
        errorMessage: undefined,
      }));
      await runSync(result.accessToken);
    } catch (err) {
      setDismissedErrorBanner(false);
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
    setDismissedReconnectBanner(false);
    setDismissedScopeUpgradeBanner(false);
    setDismissedErrorBanner(false);
    setGoogleEvents([]);
    setSyncStatus({
      state: 'local',
      lastSyncedAt: null,
      remoteFileId: null,
      remoteModifiedTime: null,
      userEmail: null,
      userName: null,
      needsReconnect: false,
      needsCalendarScopeUpgrade: false,
      reconnectReason: undefined,
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

  const handleSaveSession = (
    rating: 1 | 2 | 3 | 4 | 5,
    notes: string,
    markCompleted = false
  ) => {
    const totalMs = computeElapsedMs(timer);
    const durationSeconds = Math.max(1, Math.round(totalMs / 1000));
    const endedAt = new Date();
    const startedAt = new Date(endedAt.getTime() - durationSeconds * 1000);
    const meetsOneMinute = totalMs >= 60_000;
    const loggedMins = meetsOneMinute ? Math.max(1, Math.round(totalMs / 60_000)) : 0;
    const sessionDateKey = toLocalDateKey(endedAt);
    const nowIso = new Date().toISOString();

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

    // Pre-resolve target block & task so we can also trigger immediate remote completion sync
    let preTargetBlockId = timer.calendarBlockId;
    if (!preTargetBlockId && timer.taskId) {
      const taskBlocks = dbRef.current.calendar_blocks.filter(
        (b) => !b.deleted && b.taskId === timer.taskId
      );
      const todayMatch =
        taskBlocks.find((b) => b.date === sessionDateKey && !b.completed) ||
        taskBlocks.find((b) => b.date === sessionDateKey);
      const fallbackMatch =
        taskBlocks.find((b) => !b.completed) || taskBlocks[taskBlocks.length - 1];
      preTargetBlockId = (todayMatch || fallbackMatch)?.id;
    }
    const preTargetBlock = preTargetBlockId
      ? dbRef.current.calendar_blocks.find((b) => b.id === preTargetBlockId)
      : undefined;
    const willAutoCompleteBlock =
      !!preTargetBlock &&
      loggedMins > 0 &&
      (preTargetBlock.actualMinutes || 0) + loggedMins >= preTargetBlock.durationMinutes;
    const shouldCompleteLinked = markCompleted || willAutoCompleteBlock;
    const preResolvedTaskId = timer.taskId || preTargetBlock?.taskId;
    const preExistingTask = preResolvedTaskId
      ? dbRef.current.tasks_metadata[preResolvedTaskId]
      : undefined;

    mutateDb((prev) => {
      const nextTasks = { ...prev.tasks_metadata };
      if (loggedMins > 0 && timer.taskId && nextTasks[timer.taskId]) {
        nextTasks[timer.taskId] = {
          ...nextTasks[timer.taskId],
          logged_minutes: (nextTasks[timer.taskId].logged_minutes || 0) + loggedMins,
          updatedAt: nowIso,
        };
      }

      let targetBlockId = timer.calendarBlockId;
      if (!targetBlockId && timer.taskId) {
        const taskBlocks = prev.calendar_blocks.filter(
          (b) => !b.deleted && b.taskId === timer.taskId
        );
        const todayMatch =
          taskBlocks.find((b) => b.date === sessionDateKey && !b.completed) ||
          taskBlocks.find((b) => b.date === sessionDateKey);
        const fallbackMatch =
          taskBlocks.find((b) => !b.completed) || taskBlocks[taskBlocks.length - 1];
        targetBlockId = (todayMatch || fallbackMatch)?.id;
      }

      let resolvedBlockTaskId: string | undefined;
      let blockReachedCompletion = markCompleted;

      const nextBlocks = prev.calendar_blocks.map((b) => {
        if (b.id === targetBlockId) {
          resolvedBlockTaskId = b.taskId;
          const nextActual = (b.actualMinutes || 0) + loggedMins;
          const isDone = markCompleted || (loggedMins > 0 && nextActual >= b.durationMinutes);
          if (isDone) blockReachedCompletion = true;
          return {
            ...b,
            actualMinutes: loggedMins > 0 ? nextActual : b.actualMinutes,
            completed: isDone ? true : b.completed,
            updatedAt: loggedMins > 0 || isDone ? nowIso : b.updatedAt,
          };
        }
        if (
          markCompleted &&
          !targetBlockId &&
          timer.taskId &&
          !b.deleted &&
          b.taskId === timer.taskId
        ) {
          return {
            ...b,
            completed: true,
            updatedAt: nowIso,
          };
        }
        return b;
      });

      const taskToCompleteId = timer.taskId || resolvedBlockTaskId;
      if (blockReachedCompletion && taskToCompleteId && nextTasks[taskToCompleteId]) {
        const existingTask = nextTasks[taskToCompleteId];
        const effectiveRepeat = normalizeRepeatRule(existingTask.repeat);
        const shouldSpawnNext =
          existingTask.status !== 'completed' &&
          !!effectiveRepeat &&
          !existingTask.nextOccurrenceSpawned;

        nextTasks[taskToCompleteId] = {
          ...existingTask,
          status: 'completed',
          completedAt: existingTask.completedAt || nowIso,
          nextOccurrenceSpawned: shouldSpawnNext
            ? true
            : existingTask.nextOccurrenceSpawned,
          updatedAt: nowIso,
        };

        if (shouldSpawnNext && effectiveRepeat) {
          const nextId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
          const nextDue = computeNextDueDate(existingTask.due, effectiveRepeat);
          nextTasks[nextId] = {
            google_task_id: nextId,
            subjectId: existingTask.subjectId,
            title: existingTask.title,
            notes: existingTask.notes,
            due: nextDue,
            status: 'needsAction',
            estimated_minutes: existingTask.estimated_minutes,
            logged_minutes: 0,
            priority: existingTask.priority,
            repeat: effectiveRepeat,
            updatedAt: nowIso,
          };
        }
      }

      return {
        ...prev,
        tasks_metadata: nextTasks,
        calendar_blocks: nextBlocks,
        study_sessions: [newSession, ...prev.study_sessions],
      };
    }, true);

    if (shouldCompleteLinked && preExistingTask && preExistingTask.googleTaskListId) {
      syncTaskChangeToGoogleTasks({
        ...preExistingTask,
        logged_minutes: (preExistingTask.logged_minutes || 0) + loggedMins,
        status: 'completed',
        completedAt: preExistingTask.completedAt || nowIso,
        updatedAt: nowIso,
      });
    }

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
    const newTask: TaskMetadata = {
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
    };

    mutateDb((prev) => ({
      ...prev,
      tasks_metadata: {
        ...prev.tasks_metadata,
        [id]: newTask,
      },
    }));

    pushAndPromoteLocalTask(newTask);
  };

  const handleUpdateTask = (
    taskId: string,
    patch: Partial<TaskMetadata>,
    syncSource: SyncSource = 'task'
  ) => {
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

    const hasStatusPatch = patch.status !== undefined;
    const hasCalendarFieldChange =
      patch.title !== undefined || patch.subjectId !== undefined;
    const matchesLinkedOrLegacyBlock = (b: CalendarBlock, refTask: TaskMetadata) =>
      !b.deleted &&
      (b.taskId === taskId ||
        (!b.taskId &&
          b.title === refTask.title &&
          b.subjectId === refTask.subjectId));
    const linkedBlocks =
      currentTask && (hasCalendarFieldChange || hasStatusPatch)
        ? dbRef.current.calendar_blocks.filter((b) =>
            matchesLinkedOrLegacyBlock(b, currentTask)
          )
        : [];
    const nowIso = new Date().toISOString();

    let spawnedTaskSnapshot: TaskMetadata | null = null;
    if (willRollForward && currentTask && targetRepeat) {
      const nextId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const nextDue = computeNextDueDate(
        patch.due !== undefined ? patch.due : currentTask.due,
        targetRepeat
      );
      spawnedTaskSnapshot = {
        google_task_id: nextId,
        subjectId: patch.subjectId !== undefined ? patch.subjectId : currentTask.subjectId,
        title: patch.title !== undefined ? patch.title : currentTask.title,
        notes: patch.notes !== undefined ? patch.notes : currentTask.notes,
        due: nextDue,
        status: 'needsAction',
        estimated_minutes:
          patch.estimated_minutes !== undefined
            ? patch.estimated_minutes
            : currentTask.estimated_minutes,
        logged_minutes: 0,
        priority: patch.priority !== undefined ? patch.priority : currentTask.priority,
        repeat: targetRepeat,
        updatedAt: nowIso,
      };
    }

    mutateDb((prev) => {
      const existing = prev.tasks_metadata[taskId];
      if (!existing) return prev;

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

      if (shouldSpawnNext && spawnedTaskSnapshot) {
        nextTasks[spawnedTaskSnapshot.google_task_id] = spawnedTaskSnapshot;
      }

      const shouldUpdateBlocks =
        syncSource !== 'calendar' &&
        syncSource !== 'google_calendar' &&
        (hasCalendarFieldChange || hasStatusPatch);
      const nextBlocks = shouldUpdateBlocks
        ? prev.calendar_blocks.map((b) =>
            matchesLinkedOrLegacyBlock(b, existing)
              ? {
                  ...b,
                  taskId,
                  ...(patch.title !== undefined ? { title: patch.title } : {}),
                  ...(patch.subjectId !== undefined ? { subjectId: patch.subjectId } : {}),
                  ...(hasStatusPatch
                    ? { completed: patch.status === 'completed' }
                    : {}),
                  updatedAt: nowIso,
                }
              : b
          )
        : prev.calendar_blocks;

      return {
        ...prev,
        tasks_metadata: nextTasks,
        calendar_blocks: nextBlocks,
      };
    }, willRollForward);

    if (
      syncSource !== 'calendar' &&
      syncSource !== 'google_calendar' &&
      hasCalendarFieldChange &&
      linkedBlocks.length > 0
    ) {
      for (const blk of linkedBlocks) {
        if (!blk.googleEventId) continue;
        const updatedBlk: CalendarBlock = {
          ...blk,
          taskId,
          ...(patch.title !== undefined ? { title: patch.title } : {}),
          ...(patch.subjectId !== undefined ? { subjectId: patch.subjectId } : {}),
          updatedAt: nowIso,
        };
        const subjectName = dbRef.current.subjects.find(
          (s) => s.id === updatedBlk.subjectId
        )?.name;
        void runCalendarMutation(async (token) => {
          const returnedId = await updateGoogleCalendarEventForBlock(
            token,
            updatedBlk,
            subjectName
          );
          if (returnedId && returnedId !== updatedBlk.googleEventId) {
            mutateDb((prev) => ({
              ...prev,
              calendar_blocks: prev.calendar_blocks.map((b) =>
                b.id === updatedBlk.id ? { ...b, googleEventId: returnedId } : b
              ),
            }));
          }
        });
      }
    }

    if (
      syncSource !== 'google_tasks' &&
      currentTask &&
      currentTask.googleTaskListId &&
      (patch.status !== undefined ||
        patch.title !== undefined ||
        patch.subjectId !== undefined ||
        patch.due !== undefined ||
        patch.notes !== undefined ||
        hasRepeatPatch)
    ) {
      syncTaskChangeToGoogleTasks(
        {
          ...currentTask,
          ...patch,
          repeat: targetRepeat,
          updatedAt: nowIso,
        },
        syncSource
      );
    }

    if (spawnedTaskSnapshot) {
      pushAndPromoteLocalTask(spawnedTaskSnapshot);
    }
  };

  const handleDeleteTask = (taskId: string) => {
    const existingTask = dbRef.current.tasks_metadata[taskId];
    const linkedBlocks = dbRef.current.calendar_blocks.filter(
      (b) => !b.deleted && b.taskId === taskId
    );
    const nowIso = new Date().toISOString();

    mutateDb((prev) => {
      const existing = prev.tasks_metadata[taskId];
      if (!existing) return prev;
      const nextTasks = { ...prev.tasks_metadata };
      if (existing.googleTaskListId) {
        // Tombstone so Google Tasks sync removes it remotely
        nextTasks[taskId] = {
          ...existing,
          deleted: true,
          updatedAt: nowIso,
        };
      } else {
        delete nextTasks[taskId];
      }

      const nextBlocks = prev.calendar_blocks
        .filter((b) => !(b.taskId === taskId && !b.googleEventId))
        .map((b) =>
          b.taskId === taskId && b.googleEventId
            ? { ...b, deleted: true, updatedAt: nowIso }
            : b
        );

      return {
        ...prev,
        tasks_metadata: nextTasks,
        calendar_blocks: nextBlocks,
      };
    });

    if (existingTask?.googleTaskListId) {
      const listId = existingTask.googleTaskListId;
      void runCalendarMutation(async (token) => {
        await deleteGoogleTaskRemote(token, listId, taskId);
        mutateDb((prev) => {
          const nextTasks = { ...prev.tasks_metadata };
          delete nextTasks[taskId];
          return { ...prev, tasks_metadata: nextTasks };
        });
      });
    }

    for (const blk of linkedBlocks) {
      if (!blk.googleEventId) continue;
      const eventId = blk.googleEventId;
      void runCalendarMutation(async (token) => {
        await deleteGoogleCalendarEventById(token, eventId);
        mutateDb((prev) => ({
          ...prev,
          calendar_blocks: prev.calendar_blocks.filter((b) => b.id !== blk.id),
        }));
      });
    }
  };

  // Calendar Block CRUD
  const handleCreateBlock = (blockInput: Omit<CalendarBlock, 'id' | 'updatedAt'>) => {
    const nowIso = new Date().toISOString();
    const blockId = `blk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const shouldCreateParentTask = !blockInput.taskId;
    const localTaskId = shouldCreateParentTask
      ? `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      : blockInput.taskId!;

    const newTask: TaskMetadata | null = shouldCreateParentTask
      ? {
          google_task_id: localTaskId,
          subjectId: blockInput.subjectId,
          title: blockInput.title,
          due: blockInput.date,
          status: 'needsAction',
          estimated_minutes: Math.max(15, blockInput.durationMinutes),
          logged_minutes: 0,
          priority: 'medium',
          updatedAt: nowIso,
        }
      : null;

    const newBlock: CalendarBlock = {
      ...blockInput,
      id: blockId,
      taskId: localTaskId,
      updatedAt: nowIso,
    };

    mutateDb((prev) => ({
      ...prev,
      tasks_metadata: newTask
        ? { ...prev.tasks_metadata, [newTask.google_task_id]: newTask }
        : prev.tasks_metadata,
      calendar_blocks: [...prev.calendar_blocks, newBlock],
    }));

    if (newTask) {
      pushAndPromoteLocalTask(newTask);
    }

    if (!newBlock.googleEventId) {
      const subjectName = dbRef.current.subjects.find(
        (s) => s.id === newBlock.subjectId
      )?.name;
      void runCalendarMutation(async (token) => {
        const googleEventId = await createGoogleCalendarEventForBlock(
          token,
          newBlock,
          subjectName
        );
        mutateDb((prev) => ({
          ...prev,
          calendar_blocks: prev.calendar_blocks.map((b) =>
            b.id === blockId ? { ...b, googleEventId } : b
          ),
        }));
      });
    }
  };

  const handleUpdateBlock = (
    blockId: string,
    patch: Partial<CalendarBlock>,
    syncSource: SyncSource = 'calendar'
  ) => {
    const existingBlock = dbRef.current.calendar_blocks.find((b) => b.id === blockId);
    const nowIso = new Date().toISOString();
    const linkedTaskId = existingBlock?.taskId;
    const existingLinkedTask = linkedTaskId
      ? dbRef.current.tasks_metadata[linkedTaskId]
      : undefined;

    const shouldUpdateDueFromDate =
      patch.date !== undefined &&
      !!existingLinkedTask &&
      (!existingLinkedTask.due || existingLinkedTask.due === existingBlock?.date);
    const hasLinkedTaskChange =
      syncSource !== 'task' &&
      syncSource !== 'google_tasks' &&
      !!existingLinkedTask &&
      !existingLinkedTask.deleted &&
      (patch.title !== undefined ||
        patch.subjectId !== undefined ||
        patch.completed !== undefined ||
        shouldUpdateDueFromDate);

    let spawnedNextTask: TaskMetadata | null = null;
    if (
      hasLinkedTaskChange &&
      existingLinkedTask &&
      patch.completed === true &&
      existingLinkedTask.status !== 'completed'
    ) {
      const effectiveRepeat = normalizeRepeatRule(existingLinkedTask.repeat);
      if (effectiveRepeat && !existingLinkedTask.nextOccurrenceSpawned) {
        const nextId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const baseDue = shouldUpdateDueFromDate ? patch.date : existingLinkedTask.due;
        spawnedNextTask = {
          google_task_id: nextId,
          subjectId:
            patch.subjectId !== undefined
              ? patch.subjectId
              : existingLinkedTask.subjectId,
          title: patch.title !== undefined ? patch.title : existingLinkedTask.title,
          notes: existingLinkedTask.notes,
          due: computeNextDueDate(baseDue, effectiveRepeat),
          status: 'needsAction',
          estimated_minutes: existingLinkedTask.estimated_minutes,
          logged_minutes: 0,
          priority: existingLinkedTask.priority,
          repeat: effectiveRepeat,
          updatedAt: nowIso,
        };
      }
    }

    mutateDb((prev) => {
      let nextTasks = prev.tasks_metadata;
      if (hasLinkedTaskChange && linkedTaskId && prev.tasks_metadata[linkedTaskId]) {
        const t = prev.tasks_metadata[linkedTaskId];
        const nextStatus =
          patch.completed !== undefined
            ? patch.completed
              ? 'completed'
              : 'needsAction'
            : t.status;
        nextTasks = {
          ...prev.tasks_metadata,
          [linkedTaskId]: {
            ...t,
            ...(patch.title !== undefined ? { title: patch.title } : {}),
            ...(patch.subjectId !== undefined ? { subjectId: patch.subjectId } : {}),
            ...(shouldUpdateDueFromDate ? { due: patch.date } : {}),
            ...(patch.completed !== undefined
              ? {
                  status: nextStatus,
                  completedAt: patch.completed ? t.completedAt || nowIso : undefined,
                  nextOccurrenceSpawned: spawnedNextTask
                    ? true
                    : t.nextOccurrenceSpawned,
                }
              : {}),
            updatedAt: nowIso,
          },
        };
        if (spawnedNextTask) {
          nextTasks[spawnedNextTask.google_task_id] = spawnedNextTask;
        }
      }

      return {
        ...prev,
        tasks_metadata: nextTasks,
        calendar_blocks: prev.calendar_blocks.map((b) =>
          b.id === blockId ? { ...b, ...patch, updatedAt: nowIso } : b
        ),
      };
    }, Boolean(spawnedNextTask));

    const shouldSyncCalendar =
      syncSource !== 'google_calendar' &&
      (patch.title !== undefined ||
        patch.date !== undefined ||
        patch.startMinutes !== undefined ||
        patch.durationMinutes !== undefined ||
        patch.subjectId !== undefined);

    if (existingBlock && !existingBlock.deleted && shouldSyncCalendar) {
      const updatedBlock: CalendarBlock = {
        ...existingBlock,
        ...patch,
        updatedAt: nowIso,
      };
      const subjectName = dbRef.current.subjects.find(
        (s) => s.id === updatedBlock.subjectId
      )?.name;
      void runCalendarMutation(async (token) => {
        const returnedEventId = await updateGoogleCalendarEventForBlock(
          token,
          updatedBlock,
          subjectName
        );
        if (returnedEventId && returnedEventId !== updatedBlock.googleEventId) {
          mutateDb((prev) => ({
            ...prev,
            calendar_blocks: prev.calendar_blocks.map((b) =>
              b.id === blockId ? { ...b, googleEventId: returnedEventId } : b
            ),
          }));
        }
      });
    }

    if (hasLinkedTaskChange && existingLinkedTask) {
      const nextStatus =
        patch.completed !== undefined
          ? patch.completed
            ? 'completed'
            : 'needsAction'
          : existingLinkedTask.status;
      const updatedTaskSnapshot: TaskMetadata = {
        ...existingLinkedTask,
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(patch.subjectId !== undefined ? { subjectId: patch.subjectId } : {}),
        ...(shouldUpdateDueFromDate ? { due: patch.date } : {}),
        ...(patch.completed !== undefined
          ? {
              status: nextStatus,
              completedAt: patch.completed
                ? existingLinkedTask.completedAt || nowIso
                : undefined,
            }
          : {}),
        updatedAt: nowIso,
      };
      if (updatedTaskSnapshot.googleTaskListId) {
        syncTaskChangeToGoogleTasks(updatedTaskSnapshot, syncSource);
      }
      if (spawnedNextTask) {
        pushAndPromoteLocalTask(spawnedNextTask);
      }
    }
  };

  const handleDeleteBlock = (blockId: string) => {
    const targetBlock = dbRef.current.calendar_blocks.find((b) => b.id === blockId);
    const linkedTask =
      targetBlock?.taskId ? dbRef.current.tasks_metadata[targetBlock.taskId] : undefined;
    const nowIso = new Date().toISOString();

    mutateDb((prev) => {
      const nextTasks = { ...prev.tasks_metadata };
      if (linkedTask && !linkedTask.deleted) {
        if (linkedTask.googleTaskListId) {
          nextTasks[linkedTask.google_task_id] = {
            ...linkedTask,
            deleted: true,
            updatedAt: nowIso,
          };
        } else {
          delete nextTasks[linkedTask.google_task_id];
        }
      }

      const nextBlocks = targetBlock?.googleEventId
        ? prev.calendar_blocks.map((b) =>
            b.id === blockId ? { ...b, deleted: true, updatedAt: nowIso } : b
          )
        : prev.calendar_blocks.filter((b) => b.id !== blockId);

      return {
        ...prev,
        tasks_metadata: nextTasks,
        calendar_blocks: nextBlocks,
      };
    });

    if (targetBlock?.googleEventId) {
      const eventId = targetBlock.googleEventId;
      void runCalendarMutation(async (token) => {
        await deleteGoogleCalendarEventById(token, eventId);
        mutateDb((prev) => ({
          ...prev,
          calendar_blocks: prev.calendar_blocks.filter((b) => b.id !== blockId),
        }));
      });
    }

    if (linkedTask && !linkedTask.deleted && linkedTask.googleTaskListId) {
      const listId = linkedTask.googleTaskListId;
      const taskId = linkedTask.google_task_id;
      void runCalendarMutation(async (token) => {
        await deleteGoogleTaskRemote(token, listId, taskId);
        mutateDb((prev) => {
          const nextTasks = { ...prev.tasks_metadata };
          delete nextTasks[taskId];
          return { ...prev, tasks_metadata: nextTasks };
        });
      });
    }
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
    mutateDb(
      () => ({
        ...parsed,
        pastPapers: Array.isArray(parsed.pastPapers) ? parsed.pastPapers : [],
        syllabusProgress:
          parsed.syllabusProgress && typeof parsed.syllabusProgress === 'object'
            ? parsed.syllabusProgress
            : {},
      }),
      true
    );
  };

  // Past Papers CRUD & Cadence Task / Timer Integration
  const handleCreatePaper = (paper: PastPaperRecord) => {
    mutateDb((prev) => ({
      ...prev,
      pastPapers: [paper, ...(prev.pastPapers || [])],
    }));
  };

  const handleUpdatePaper = (
    paperId: string,
    updater: (prev: PastPaperRecord) => PastPaperRecord
  ) => {
    mutateDb((prev) => ({
      ...prev,
      pastPapers: (prev.pastPapers || []).map((p) =>
        p.id === paperId ? updater(p) : p
      ),
    }));
  };

  const handleDeletePaper = (paperId: string) => {
    const nowIso = new Date().toISOString();
    mutateDb((prev) => ({
      ...prev,
      pastPapers: (prev.pastPapers || []).map((p) =>
        p.id === paperId ? { ...p, deleted: true, updatedAt: nowIso } : p
      ),
    }));
  };

  const pushPaperTaskToBacklog = (params: {
    subject: ALSubjectKey;
    title: string;
    estimatedMinutes: number;
    notes?: string;
  }) => {
    const nowIso = new Date().toISOString();
    const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const todayDue = toLocalDateKey(new Date());

    mutateDb((prev) => {
      const matched = findMatchingUserSubject(params.subject, prev.subjects);
      let resolvedSubjectId = matched?.id || '';
      let nextSubjects = prev.subjects;

      if (!matched) {
        const cfg = AL_SUBJECT_CONFIGS[params.subject];
        const newSubjId = `subj-${params.subject}-${Date.now()}`;
        resolvedSubjectId = newSubjId;
        nextSubjects = [
          ...prev.subjects,
          {
            id: newSubjId,
            name: cfg.label,
            color: cfg.defaultColor,
            updatedAt: nowIso,
          },
        ];
      }

      return {
        ...prev,
        subjects: nextSubjects,
        tasks_metadata: {
          ...prev.tasks_metadata,
          [taskId]: {
            google_task_id: taskId,
            subjectId: resolvedSubjectId,
            title: params.title,
            notes: params.notes,
            due: todayDue,
            status: 'needsAction',
            estimated_minutes: params.estimatedMinutes,
            logged_minutes: 0,
            priority: 'high',
            updatedAt: nowIso,
          },
        },
      };
    });
  };

  const handleSendPaperQuestionToTasks = (params: {
    subject: ALSubjectKey;
    paperTitle: string;
    questionCode: string;
    syllabusUnit?: string;
    mistakeNote?: string;
  }) => {
    const cfg = AL_SUBJECT_CONFIGS[params.subject];
    const unitPart = params.syllabusUnit ? ` (${params.syllabusUnit})` : '';
    const title = `Redo ${cfg.shortLabel} ${params.paperTitle} ${params.questionCode}${unitPart}`;
    pushPaperTaskToBacklog({
      subject: params.subject,
      title,
      estimatedMinutes: 30,
      notes: params.mistakeNote || undefined,
    });
  };

  const handleSendPaperBatchToTasks = (entries: RedoQueueEntry[]) => {
    if (entries.length === 0) return;
    const primarySubject = entries[0].subject;
    const cfg = AL_SUBJECT_CONFIGS[primarySubject];
    const uniquePapers = Array.from(new Set(entries.map((e) => e.paperTitle)));
    const uniqueUnits = Array.from(
      new Set(entries.map((e) => e.syllabusUnit).filter(Boolean))
    ) as string[];
    const codes = entries
      .slice(0, 4)
      .map((e) => e.displayCode)
      .join(', ');
    const extra = entries.length > 4 ? ` +${entries.length - 4} more` : '';
    const paperSegment =
      uniquePapers.length === 1 ? ` ${uniquePapers[0]}` : '';
    const unitSegment =
      uniqueUnits.length === 1 ? ` (${uniqueUnits[0]})` : '';
    const title = `Redo ${cfg.shortLabel}${paperSegment} ${codes}${extra}${unitSegment}`;
    const estimatedMinutes = Math.min(
      180,
      Math.max(30, Math.ceil((entries.length * 15) / 15) * 15)
    );
    const notes = entries
      .map(
        (e) =>
          `• ${e.paperTitle} ${e.displayCode}${
            e.syllabusUnit ? ` [${e.syllabusUnit}]` : ''
          }${e.mistakeNote ? `: ${e.mistakeNote}` : ''}`
      )
      .join('\n');

    pushPaperTaskToBacklog({
      subject: primarySubject,
      title,
      estimatedMinutes,
      notes,
    });
  };

  const handleStartRedoTimer = (params: {
    subject: ALSubjectKey;
    title: string;
  }) => {
    const matched = findMatchingUserSubject(params.subject, dbRef.current.subjects);
    const presetMode =
      dbRef.current.settings.pomodoroPreset === '50_10'
        ? 'pomodoro_50'
        : 'pomodoro_25';
    const targetMs =
      (presetMode === 'pomodoro_50' ? 50 : 25) * 60 * 1000;

    setTimer({
      mode: presetMode,
      phase: 'focus',
      status: 'running',
      startedAtMs: Date.now(),
      accumulatedMs: 0,
      targetDurationMs: targetMs,
      subjectId: matched?.id || '',
      title: params.title,
    });
  };

  // Syllabus Progress Handlers
  const handleUpdateSyllabusSubtopic = (
    subtopic: ResolvedSubtopicItem,
    patch: Partial<SyllabusSubtopicProgress>
  ) => {
    const nowIso = new Date().toISOString();
    mutateDb((prev) => {
      const currentMap = prev.syllabusProgress || {};
      const existing = currentMap[subtopic.id];
      const nextEntry: SyllabusSubtopicProgress = {
        id: subtopic.id,
        unitId: subtopic.unitId,
        subject: subtopic.subject,
        title: subtopic.title,
        isCustom: subtopic.isCustom,
        status: existing?.status || subtopic.status || 'not_started',
        confidence: existing?.confidence || subtopic.confidence || 1,
        revisionCount: existing?.revisionCount ?? subtopic.revisionCount ?? 0,
        lastRevisedAt: existing?.lastRevisedAt ?? subtopic.lastRevisedAt,
        note: existing?.note ?? subtopic.note,
        ...patch,
        updatedAt: nowIso,
      };
      return {
        ...prev,
        syllabusProgress: {
          ...currentMap,
          [subtopic.id]: nextEntry,
        },
      };
    });
  };

  const handleAddCustomSyllabusSubtopic = (
    unit: SyllabusUnitSeed,
    title: string
  ) => {
    const nowIso = new Date().toISOString();
    const id = `custom-${unit.id}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 5)}`;
    mutateDb((prev) => ({
      ...prev,
      syllabusProgress: {
        ...(prev.syllabusProgress || {}),
        [id]: {
          id,
          unitId: unit.id,
          subject: unit.subject,
          title,
          isCustom: true,
          status: 'not_started',
          confidence: 1,
          revisionCount: 0,
          updatedAt: nowIso,
        },
      },
    }));
  };

  const handleDeleteCustomSyllabusSubtopic = (subtopicId: string) => {
    const nowIso = new Date().toISOString();
    mutateDb((prev) => {
      const existing = prev.syllabusProgress?.[subtopicId];
      if (!existing) return prev;
      return {
        ...prev,
        syllabusProgress: {
          ...(prev.syllabusProgress || {}),
          [subtopicId]: {
            ...existing,
            deleted: true,
            updatedAt: nowIso,
          },
        },
      };
    });
  };

  const handleAddSyllabusRevisionTask = (params: {
    subject: ALSubjectKey;
    subtopicTitle: string;
    unitTitle: string;
    note?: string;
    isUrgent?: boolean;
  }) => {
    const nowIso = new Date().toISOString();
    const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const todayDue = toLocalDateKey(new Date());

    mutateDb((prev) => {
      const matched = findMatchingUserSubject(params.subject, prev.subjects);
      let resolvedSubjectId = matched?.id || '';
      let nextSubjects = prev.subjects;

      if (!matched) {
        const cfg = AL_SUBJECT_CONFIGS[params.subject];
        const newSubjId = `subj-${params.subject}-${Date.now()}`;
        resolvedSubjectId = newSubjId;
        nextSubjects = [
          ...prev.subjects,
          {
            id: newSubjId,
            name: cfg.label,
            color: cfg.defaultColor,
            updatedAt: nowIso,
          },
        ];
      }

      const taskNotes = [params.unitTitle, params.note]
        .filter(Boolean)
        .join('\n');

      return {
        ...prev,
        subjects: nextSubjects,
        tasks_metadata: {
          ...prev.tasks_metadata,
          [taskId]: {
            google_task_id: taskId,
            subjectId: resolvedSubjectId,
            title: `Revise: ${params.subtopicTitle}`,
            notes: taskNotes || undefined,
            due: todayDue,
            status: 'needsAction',
            estimated_minutes: 45,
            logged_minutes: 0,
            priority: params.isUrgent ? 'high' : 'medium',
            updatedAt: nowIso,
          },
        },
      };
    });
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
    { id: 'papers', label: 'Papers', icon: <FileText className="w-5 h-5" /> },
    { id: 'syllabus', label: 'Syllabus', icon: <BookOpen className="w-5 h-5" /> },
  ];

  const syncLabel = !isOnline
    ? 'Offline'
    : syncStatus.state === 'syncing'
    ? 'Syncing...'
    : isGoogleConnected
    ? `Synced · ${formatRelativeTime(syncStatus.lastSyncedAt)}`
    : syncStatus.needsReconnect
    ? 'Reconnect Google'
    : 'Preferences';

  return (
    <div className="min-h-screen flex flex-col overflow-x-clip bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* TOP BAR (3-Zone Contract) */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-4 sm:gap-8 h-13 sm:h-14 min-h-0 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md px-4 sm:px-6">
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
                : syncStatus.needsReconnect
                ? 'border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/50'
                : 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:opacity-90'
            }`}
          >
            <Settings
              className={`w-3.5 h-3.5 shrink-0 ${
                isGoogleConnected ? '' : 'opacity-80'
              }`}
            />
            <span>{syncLabel}</span>
          </button>
        </div>
      </header>

      {/* MAIN VIEWPORT */}
      <main className="flex-1 min-h-0 pb-28 md:pb-14">
        {syncStatus.needsReconnect && !isGoogleConnected && !dismissedReconnectBanner && (
          <div className="mx-auto max-w-[1600px] px-4 sm:px-6 pt-3">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/90 dark:bg-amber-950/35 px-3.5 py-2 text-xs text-amber-900 dark:text-amber-200">
              <div className="flex items-center gap-2 min-w-0">
                <AlertCircle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <span className="truncate">
                  Google session expired{syncStatus.userEmail ? ` (${syncStatus.userEmail})` : ''}. Your locally cached tasks and calendar remain available.
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-auto">
                <button
                  type="button"
                  onClick={() => void handleGoogleConnect()}
                  disabled={syncStatus.state === 'connecting'}
                  className="rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-60 px-2.5 py-1 text-xs font-medium text-white transition-colors cursor-pointer whitespace-nowrap"
                >
                  {syncStatus.state === 'connecting' ? 'Connecting...' : 'Reconnect Google'}
                </button>
                <button
                  type="button"
                  onClick={() => setDismissedReconnectBanner(true)}
                  className="p-1 rounded-md text-amber-700/70 hover:text-amber-900 dark:text-amber-300/70 dark:hover:text-amber-100 cursor-pointer"
                  aria-label="Dismiss reconnect notice"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}
        {syncStatus.needsCalendarScopeUpgrade && !dismissedScopeUpgradeBanner && (
          <div className="mx-auto max-w-[1600px] px-4 sm:px-6 pt-3">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/90 dark:bg-blue-950/35 px-3.5 py-2 text-xs text-blue-900 dark:text-blue-200">
              <div className="flex items-center gap-2 min-w-0">
                <AlertCircle className="w-4 h-4 shrink-0 text-blue-600 dark:text-blue-400" />
                <span className="truncate">
                  Google Calendar write permission is required to sync new, updated, and deleted study blocks to your calendar.
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-auto">
                <button
                  type="button"
                  onClick={() => void handleGrantCalendarScopeUpgrade()}
                  disabled={syncStatus.state === 'connecting'}
                  className="rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 px-2.5 py-1 text-xs font-medium text-white transition-colors cursor-pointer whitespace-nowrap"
                >
                  {syncStatus.state === 'connecting' ? 'Authorizing...' : 'Grant Calendar Access'}
                </button>
                <button
                  type="button"
                  onClick={() => setDismissedScopeUpgradeBanner(true)}
                  className="p-1 rounded-md text-blue-700/70 hover:text-blue-900 dark:text-blue-300/70 dark:hover:text-blue-100 cursor-pointer"
                  aria-label="Dismiss Calendar permission notice"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}
        {syncStatus.errorMessage && !dismissedErrorBanner && (
          <div className="mx-auto max-w-[1600px] px-4 sm:px-6 pt-3" role="alert">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/95 dark:bg-rose-950/40 px-3.5 py-2.5 text-xs text-rose-900 dark:text-rose-200">
              <div className="flex items-start gap-2 min-w-0 flex-1">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
                <span className="break-words">{syncStatus.errorMessage}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-auto">
                {isGoogleConnected ? (
                  <button
                    type="button"
                    onClick={() => void runSync()}
                    disabled={syncStatus.state === 'syncing'}
                    className="rounded-lg bg-rose-600 hover:bg-rose-700 disabled:opacity-60 px-2.5 py-1 text-xs font-medium text-white transition-colors cursor-pointer whitespace-nowrap"
                  >
                    {syncStatus.state === 'syncing' ? 'Retrying...' : 'Retry Sync'}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowSetupModal(true)}
                    className="rounded-lg bg-rose-600 hover:bg-rose-700 px-2.5 py-1 text-xs font-medium text-white transition-colors cursor-pointer whitespace-nowrap"
                  >
                    Preferences
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setDismissedErrorBanner(true)}
                  className="p-1 rounded-md text-rose-700/70 hover:text-rose-900 dark:text-rose-300/70 dark:hover:text-rose-100 cursor-pointer"
                  aria-label="Dismiss sync error notice"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}
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

        {activeTab === 'papers' && (
          <PapersView
            subjects={db.subjects}
            pastPapers={db.pastPapers || []}
            onCreatePaper={handleCreatePaper}
            onUpdatePaper={handleUpdatePaper}
            onDeletePaper={handleDeletePaper}
            onSendQuestionToTasks={handleSendPaperQuestionToTasks}
            onSendBatchToTasks={handleSendPaperBatchToTasks}
            onStartRedoTimer={handleStartRedoTimer}
          />
        )}

        {activeTab === 'syllabus' && (
          <SyllabusView
            subjects={db.subjects}
            syllabusProgress={db.syllabusProgress || {}}
            onUpdateSubtopic={handleUpdateSyllabusSubtopic}
            onAddCustomSubtopic={handleAddCustomSyllabusSubtopic}
            onDeleteCustomSubtopic={handleDeleteCustomSyllabusSubtopic}
            onAddRevisionTask={handleAddSyllabusRevisionTask}
            onStartRevisionTimer={handleStartRedoTimer}
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
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 grid grid-cols-6 items-center h-16 pb-safe border-t border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md"
      >
        {navItems.map((item) => {
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`flex flex-col items-center justify-center min-h-[44px] min-w-0 px-0.5 py-1.5 transition-colors whitespace-nowrap cursor-pointer ${
                active
                  ? 'text-blue-600 dark:text-blue-400'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              {item.icon}
              <span className="text-[10px] sm:text-[11px] font-medium tracking-tight mt-0.5 truncate">
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

          if (navigator.onLine && (isGoogleConnected || (getStoredUserProfile().email && !syncStatusRef.current.needsReconnect))) {
            setSyncStatus((prev) => ({ ...prev, state: 'syncing', errorMessage: undefined }));
            try {
              const token = await ensureValidGoogleToken();
              if (token) {
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
                  needsReconnect: false,
                  reconnectReason: undefined,
                  errorMessage: undefined,
                }));
              } else {
                setSyncStatus((prev) => ({ ...prev, state: 'local' }));
              }
            } catch (err) {
              if (err instanceof GoogleAuthInteractionRequiredError) {
                setIsGoogleConnected(false);
                setDismissedReconnectBanner(false);
                setSyncStatus((prev) => ({
                  ...prev,
                  state: 'local',
                  needsReconnect: true,
                  reconnectReason: err.code,
                  errorMessage: undefined,
                }));
              } else {
                setSyncStatus((prev) => ({
                  ...prev,
                  state: 'error',
                  errorMessage:
                    err instanceof Error ? err.message : 'Failed to overwrite study_sync.json.',
                }));
              }
            }
          }
        }}
      />

      <SessionCompleteModal
        isOpen={showLogModal}
        title={timer.title}
        subjectName={activeSubject?.name || 'No Subject'}
        durationSeconds={Math.round(elapsedMs / 1000)}
        hasLinkedTarget={Boolean(timer.taskId || timer.calendarBlockId)}
        defaultMarkCompleted={Boolean(
          (timer.taskId || timer.calendarBlockId) &&
            timer.targetDurationMs > 0 &&
            elapsedMs >= timer.targetDurationMs
        )}
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
