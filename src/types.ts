export type Priority = 'low' | 'medium' | 'high';

export type TaskStatus = 'needsAction' | 'completed';

export type TimerMode = 'pomodoro_25' | 'pomodoro_50' | 'flowtime' | 'block';

export type TimerPhase = 'focus' | 'break';

export type TimerRunStatus = 'idle' | 'running' | 'paused';

export interface Subject {
  id: string;
  name: string;
  color: string; // Hex color
  googleTaskListId?: string;
  updatedAt: string;
}

export type RepeatType = 'none' | 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'custom';

export interface RepeatRule {
  type: RepeatType;
  daysOfWeek?: number[]; // 0=Sun, 1=Mon, ..., 6=Sat
}

export interface TaskMetadata {
  google_task_id: string; // Maps to Google Task ID when synced, or local UUID until synced
  googleTaskListId?: string;
  subjectId: string;
  title: string;
  notes?: string;
  due?: string; // YYYY-MM-DD
  status: TaskStatus;
  completedAt?: string;
  estimated_minutes: number;
  logged_minutes: number;
  priority: Priority;
  repeat?: RepeatRule;
  nextOccurrenceSpawned?: boolean;
  updatedAt: string;
  deleted?: boolean;
}

export interface CalendarBlock {
  id: string;
  taskId?: string;
  subjectId: string;
  title: string;
  date: string; // YYYY-MM-DD
  startMinutes: number; // 0..1440
  durationMinutes: number; // multiple of 15
  completed?: boolean;
  updatedAt: string;
  deleted?: boolean;
}

export interface StudySession {
  id: string;
  taskId?: string;
  subjectId: string;
  title: string;
  mode: TimerMode;
  startedAt: string; // ISO
  endedAt: string; // ISO
  durationSeconds: number;
  focusRating: 1 | 2 | 3 | 4 | 5;
  notes?: string;
  calendarBlockId?: string;
}

export interface ExamCountdown {
  id: string;
  title: string;
  subjectId: string;
  date: string; // YYYY-MM-DD
}

export interface AppSettings {
  pomodoroPreset: '25_5' | '50_10';
  dailyGoalMinutes: number;
  dayStartHour: number;
  dayEndHour: number;
  theme: 'light' | 'dark';
  soundEnabled: boolean;
  examBanners: ExamCountdown[];
}

export interface StudyDatabase {
  version: number;
  modifiedTime: string; // ISO timestamp for Drive sync conflict resolution
  subjects: Subject[];
  tasks_metadata: Record<string, TaskMetadata>;
  calendar_blocks: CalendarBlock[];
  study_sessions: StudySession[];
  settings: AppSettings;
}

export interface GoogleCalendarEventOverlay {
  id: string;
  summary: string;
  date: string; // YYYY-MM-DD
  startMinutes: number;
  durationMinutes: number;
  isAllDay: boolean;
  calendarName?: string;
  htmlLink?: string;
}

export interface ActiveTimerSnapshot {
  mode: TimerMode;
  phase: TimerPhase;
  status: TimerRunStatus;
  startedAtMs: number | null;
  accumulatedMs: number;
  targetDurationMs: number; // 0 for flowtime count-up
  taskId?: string;
  subjectId: string;
  title: string;
  calendarBlockId?: string;
}

export type SyncState = 'local' | 'connecting' | 'syncing' | 'synced' | 'error' | 'offline';

export interface SyncStatusInfo {
  state: SyncState;
  lastSyncedAt: string | null;
  remoteFileId: string | null;
  remoteModifiedTime: string | null;
  userEmail: string | null;
  errorMessage?: string;
}

export type MainTab = 'workspace' | 'tasks' | 'timer' | 'analytics';
export type TaskFilter = 'today' | 'upcoming' | 'unscheduled' | 'completed' | 'all';
