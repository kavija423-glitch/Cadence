import type { StudyDatabase } from '../types';

export const SUBJECT_COLORS = [
  '#2563EB', // Cobalt
  '#059669', // Emerald
  '#D97706', // Amber
  '#E11D48', // Rose
  '#0891B2', // Cyan
  '#7C3AED', // Violet
];

export function createEmptyDatabase(theme: 'light' | 'dark' = 'light'): StudyDatabase {
  return {
    version: 1,
    modifiedTime: new Date().toISOString(),
    subjects: [],
    tasks_metadata: {},
    calendar_blocks: [],
    study_sessions: [],
    pastPapers: [],
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
