import type { StudyDatabase } from '../types';
import { addDays, toLocalDateKey } from './dateUtils';

export const SUBJECT_COLORS = [
  '#2563EB', // Cobalt
  '#059669', // Emerald
  '#D97706', // Amber
  '#E11D48', // Rose
  '#0891B2', // Cyan
  '#7C3AED', // Violet
];

export function createInitialDatabase(): StudyDatabase {
  const now = new Date();
  const todayKey = toLocalDateKey(now);
  const tomorrowKey = toLocalDateKey(addDays(now, 1));
  const plus3Key = toLocalDateKey(addDays(now, 3));
  const plus5Key = toLocalDateKey(addDays(now, 5));
  const exam1Key = toLocalDateKey(addDays(now, 11));
  const exam2Key = toLocalDateKey(addDays(now, 19));
  const nowIso = now.toISOString();

  const subjects = [
    { id: 'subj-physics', name: 'Physics', color: '#2563EB', updatedAt: nowIso },
    { id: 'subj-calculus', name: 'Calculus III', color: '#059669', updatedAt: nowIso },
    { id: 'subj-chem', name: 'Organic Chem', color: '#D97706', updatedAt: nowIso },
    { id: 'subj-lit', name: 'Literature', color: '#7C3AED', updatedAt: nowIso },
  ];

  const tasks_metadata: StudyDatabase['tasks_metadata'] = {
    'task-1': {
      google_task_id: 'task-1',
      subjectId: 'subj-physics',
      title: 'Revise Electromagnetism Past Paper 2024',
      notes: 'Focus on Maxwell equations and Faraday induction problems.',
      due: todayKey,
      status: 'needsAction',
      estimated_minutes: 90,
      logged_minutes: 45,
      priority: 'high',
      updatedAt: nowIso,
    },
    'task-2': {
      google_task_id: 'task-2',
      subjectId: 'subj-calculus',
      title: 'Complete Vector Fields Problem Set 6',
      notes: "Stokes' theorem proofs Q1–Q8.",
      due: todayKey,
      status: 'needsAction',
      estimated_minutes: 60,
      logged_minutes: 25,
      priority: 'high',
      updatedAt: nowIso,
    },
    'task-3': {
      google_task_id: 'task-3',
      subjectId: 'subj-chem',
      title: 'Synthesize Aldol Condensation Flashcards',
      due: tomorrowKey,
      status: 'needsAction',
      estimated_minutes: 45,
      logged_minutes: 0,
      priority: 'medium',
      updatedAt: nowIso,
    },
    'task-4': {
      google_task_id: 'task-4',
      subjectId: 'subj-lit',
      title: 'Annotate Modernism Seminar Essay Sources',
      due: plus3Key,
      status: 'needsAction',
      estimated_minutes: 60,
      logged_minutes: 0,
      priority: 'medium',
      updatedAt: nowIso,
    },
    'task-5': {
      google_task_id: 'task-5',
      subjectId: 'subj-physics',
      title: 'Lab Error Propagation Worksheet',
      status: 'needsAction',
      estimated_minutes: 45,
      logged_minutes: 0,
      priority: 'low',
      updatedAt: nowIso,
    },
    'task-6': {
      google_task_id: 'task-6',
      subjectId: 'subj-calculus',
      title: 'Review Divergence Theorem Lecture Notes',
      due: plus5Key,
      status: 'needsAction',
      estimated_minutes: 30,
      logged_minutes: 0,
      priority: 'medium',
      updatedAt: nowIso,
    },
    'task-7': {
      google_task_id: 'task-7',
      subjectId: 'subj-chem',
      title: 'NMR Spectroscopy Practice Set 2',
      due: todayKey,
      status: 'completed',
      completedAt: nowIso,
      estimated_minutes: 45,
      logged_minutes: 50,
      priority: 'high',
      updatedAt: nowIso,
    },
  };

  const calendar_blocks: StudyDatabase['calendar_blocks'] = [
    {
      id: 'blk-1',
      taskId: 'task-1',
      subjectId: 'subj-physics',
      title: 'Revise Electromagnetism Past Paper 2024',
      date: todayKey,
      startMinutes: 9 * 60 + 30,
      durationMinutes: 90,
      updatedAt: nowIso,
    },
    {
      id: 'blk-2',
      taskId: 'task-2',
      subjectId: 'subj-calculus',
      title: 'Complete Vector Fields Problem Set 6',
      date: todayKey,
      startMinutes: 14 * 60,
      durationMinutes: 60,
      updatedAt: nowIso,
    },
    {
      id: 'blk-3',
      taskId: 'task-3',
      subjectId: 'subj-chem',
      title: 'Synthesize Aldol Condensation Flashcards',
      date: tomorrowKey,
      startMinutes: 10 * 60,
      durationMinutes: 45,
      updatedAt: nowIso,
    },
    {
      id: 'blk-4',
      taskId: 'task-4',
      subjectId: 'subj-lit',
      title: 'Annotate Modernism Seminar Essay Sources',
      date: plus3Key,
      startMinutes: 15 * 60 + 30,
      durationMinutes: 60,
      updatedAt: nowIso,
    },
  ];

  // Realistic 9-day study session history so Analytics & Streak work right away
  const sessionTemplates: Array<{
    daysAgo: number;
    subjectId: string;
    title: string;
    mins: number;
    rating: 1 | 2 | 3 | 4 | 5;
    mode: 'pomodoro_25' | 'pomodoro_50' | 'flowtime' | 'block';
  }> = [
    { daysAgo: 8, subjectId: 'subj-physics', title: 'Gauss Law Derivations', mins: 50, rating: 4, mode: 'pomodoro_50' },
    { daysAgo: 7, subjectId: 'subj-calculus', title: 'Line Integrals Practice', mins: 75, rating: 5, mode: 'flowtime' },
    { daysAgo: 6, subjectId: 'subj-chem', title: 'Stereochemistry Review', mins: 50, rating: 4, mode: 'pomodoro_50' },
    { daysAgo: 5, subjectId: 'subj-lit', title: 'Close Reading Notes', mins: 45, rating: 4, mode: 'block' },
    { daysAgo: 4, subjectId: 'subj-physics', title: 'Magnetostatics Drill', mins: 90, rating: 5, mode: 'pomodoro_50' },
    { daysAgo: 3, subjectId: 'subj-calculus', title: 'Green Theorem Problems', mins: 60, rating: 4, mode: 'block' },
    { daysAgo: 2, subjectId: 'subj-chem', title: 'Carbonyl Mechanisms', mins: 50, rating: 3, mode: 'pomodoro_50' },
    { daysAgo: 1, subjectId: 'subj-physics', title: 'Faraday Induction Drill', mins: 75, rating: 5, mode: 'flowtime' },
    { daysAgo: 1, subjectId: 'subj-lit', title: 'Essay Thesis Outline', mins: 40, rating: 4, mode: 'pomodoro_25' },
    { daysAgo: 0, subjectId: 'subj-chem', title: 'NMR Spectroscopy Practice Set 2', mins: 50, rating: 5, mode: 'pomodoro_50' },
    { daysAgo: 0, subjectId: 'subj-calculus', title: 'Vector Fields Warmup', mins: 25, rating: 4, mode: 'pomodoro_25' },
  ];

  const study_sessions: StudyDatabase['study_sessions'] = sessionTemplates.map((tpl, idx) => {
    const day = addDays(now, -tpl.daysAgo);
    day.setHours(16, 0, 0, 0);
    const end = new Date(day.getTime() + tpl.mins * 60 * 1000);
    return {
      id: `sess-seed-${idx + 1}`,
      subjectId: tpl.subjectId,
      title: tpl.title,
      mode: tpl.mode,
      startedAt: day.toISOString(),
      endedAt: end.toISOString(),
      durationSeconds: tpl.mins * 60,
      focusRating: tpl.rating,
    };
  });

  return {
    version: 1,
    modifiedTime: nowIso,
    subjects,
    tasks_metadata,
    calendar_blocks,
    study_sessions,
    settings: {
      pomodoroPreset: '25_5',
      dailyGoalMinutes: 180,
      dayStartHour: 6,
      dayEndHour: 23,
      theme: 'light',
      soundEnabled: true,
      examBanners: [
        {
          id: 'exam-1',
          title: 'Electromagnetism Midterm',
          subjectId: 'subj-physics',
          date: exam1Key,
        },
        {
          id: 'exam-2',
          title: 'Calculus III Comprehensive',
          subjectId: 'subj-calculus',
          date: exam2Key,
        },
      ],
    },
  };
}

export function createEmptyDatabase(theme: 'light' | 'dark' = 'light'): StudyDatabase {
  const nowIso = new Date().toISOString();
  return {
    version: 1,
    modifiedTime: nowIso,
    subjects: [
      { id: 'subj-general', name: 'General Study', color: '#2563EB', updatedAt: nowIso },
    ],
    tasks_metadata: {},
    calendar_blocks: [],
    study_sessions: [],
    settings: {
      pomodoroPreset: '25_5',
      dailyGoalMinutes: 180,
      dayStartHour: 6,
      dayEndHour: 23,
      theme,
      soundEnabled: true,
      examBanners: [],
    },
  };
}
