import type {
  ALSubjectKey,
  PaperQuestion,
  PastPaperRecord,
  QuestionMasteryStatus,
  QuestionSubPart,
  Subject,
} from '../types';

export interface ALSubjectConfig {
  key: ALSubjectKey;
  label: string;
  shortLabel: string;
  defaultColor: string;
  matchTerms: string[];
}

export const AL_SUBJECT_CONFIGS: Record<ALSubjectKey, ALSubjectConfig> = {
  physics: {
    key: 'physics',
    label: 'Physics',
    shortLabel: 'Physics',
    defaultColor: '#2563EB',
    matchTerms: ['physics', 'phy'],
  },
  combined: {
    key: 'combined',
    label: 'Combined Maths',
    shortLabel: 'Combined',
    defaultColor: '#059669',
    matchTerms: ['combined', 'combined maths', 'combined mathematics', 'maths', 'math'],
  },
  ict: {
    key: 'ict',
    label: 'ICT',
    shortLabel: 'ICT',
    defaultColor: '#7C3AED',
    matchTerms: ['ict', 'information technology', 'computing'],
  },
};

export const AL_SUBJECT_LIST: ALSubjectConfig[] = [
  AL_SUBJECT_CONFIGS.physics,
  AL_SUBJECT_CONFIGS.combined,
  AL_SUBJECT_CONFIGS.ict,
];

export function findMatchingUserSubject(
  key: ALSubjectKey,
  subjects: Subject[]
): Subject | undefined {
  const cfg = AL_SUBJECT_CONFIGS[key];
  // Exact match first
  const exact = subjects.find((s) => {
    const n = s.name.trim().toLowerCase();
    return cfg.matchTerms.some((term) => n === term);
  });
  if (exact) return exact;
  // Substring match fallback
  return subjects.find((s) => {
    const n = s.name.trim().toLowerCase();
    return cfg.matchTerms.some((term) => n.includes(term));
  });
}

export function resolveALSubjectDisplay(
  key: ALSubjectKey,
  subjects: Subject[]
): { label: string; color: string; matchedSubject?: Subject } {
  const cfg = AL_SUBJECT_CONFIGS[key];
  const matched = findMatchingUserSubject(key, subjects);
  return {
    label: cfg.label,
    color: matched?.color || cfg.defaultColor,
    matchedSubject: matched,
  };
}

export const SYLLABUS_UNITS: Record<ALSubjectKey, string[]> = {
  physics: [
    'Measurement',
    'Mechanics',
    'Oscillations & Waves',
    'Thermal Physics',
    'Gravitational Field',
    'Electrostatic Field',
    'Magnetic Field',
    'Current Electricity',
    'Electronics',
    'Mechanical Properties of Matter',
    'Matter & Radiation',
  ],
  combined: [
    'Algebra',
    'Trigonometry',
    'Calculus (Differentiation & Integration)',
    'Coordinate Geometry',
    'Vectors',
    'Complex Numbers',
    'Kinematics',
    "Newton's Laws & Dynamics",
    'Equilibrium & Statics',
    'Work/Power/Energy',
    'Impulse & Collisions',
    'Probability & Statistics',
  ],
  ict: [
    'Concept of ICT',
    'Data Representation',
    'Logic Gates & Boolean Algebra',
    'Operating Systems',
    'Data Communication & Networking',
    'Systems Analysis & Design (SDLC)',
    'Database Management (SQL)',
    'Programming (Python)',
    'Web Development (HTML/CSS/PHP)',
    'IoT & Emerging Tech',
    'E-Commerce',
  ],
};

export interface PaperSectionMeta {
  id: string;
  title: string;
  subtitle: string;
  isMcqGrid?: boolean;
  optionalTargetCount?: number;
}

export function getSectionsForSubject(subject: ALSubjectKey): PaperSectionMeta[] {
  if (subject === 'combined') {
    return [
      {
        id: 'Pure-A',
        title: 'Pure Maths · Part A',
        subtitle: '10 compulsory short questions',
      },
      {
        id: 'Pure-B',
        title: 'Pure Maths · Part B',
        subtitle: '7 essay questions · Attempt any 5',
        optionalTargetCount: 5,
      },
      {
        id: 'Applied-A',
        title: 'Applied Maths · Part A',
        subtitle: '10 compulsory short questions',
      },
      {
        id: 'Applied-B',
        title: 'Applied Maths · Part B',
        subtitle: '7 essay questions · Attempt any 5',
        optionalTargetCount: 5,
      },
    ];
  }

  return [
    {
      id: 'P1',
      title: 'Paper I · MCQ',
      subtitle: '50 compulsory multiple-choice questions',
      isMcqGrid: true,
    },
    {
      id: 'P2A',
      title: 'Paper II · Part A (Structured)',
      subtitle: '4 compulsory structured questions',
    },
    {
      id: 'P2B',
      title: 'Paper II · Part B (Essay)',
      subtitle: '6 essay questions · Attempt any 4',
      optionalTargetCount: 4,
    },
  ];
}

export function generatePaperQuestions(subject: ALSubjectKey): PaperQuestion[] {
  const now = new Date().toISOString();
  const questions: PaperQuestion[] = [];

  if (subject === 'combined') {
    for (let i = 1; i <= 10; i++) {
      questions.push({
        id: `Pure-A-Q${i}`,
        section: 'Pure-A',
        number: i,
        label: `Pure-A-Q${i}`,
        status: 'unlogged',
        updatedAt: now,
      });
    }
    for (let i = 11; i <= 17; i++) {
      questions.push({
        id: `Pure-B-Q${i}`,
        section: 'Pure-B',
        number: i,
        label: `Pure-B-Q${i}`,
        status: 'unlogged',
        updatedAt: now,
      });
    }
    for (let i = 1; i <= 10; i++) {
      questions.push({
        id: `Applied-A-Q${i}`,
        section: 'Applied-A',
        number: i,
        label: `Applied-A-Q${i}`,
        status: 'unlogged',
        updatedAt: now,
      });
    }
    for (let i = 11; i <= 17; i++) {
      questions.push({
        id: `Applied-B-Q${i}`,
        section: 'Applied-B',
        number: i,
        label: `Applied-B-Q${i}`,
        status: 'unlogged',
        updatedAt: now,
      });
    }
    return questions;
  }

  // Physics & ICT
  for (let i = 1; i <= 50; i++) {
    questions.push({
      id: `P1-Q${i}`,
      section: 'P1',
      number: i,
      label: `P1-Q${i}`,
      status: 'unlogged',
      updatedAt: now,
    });
  }
  for (let i = 1; i <= 4; i++) {
    questions.push({
      id: `P2A-Q${i}`,
      section: 'P2A',
      number: i,
      label: `P2A-Q${i}`,
      status: 'unlogged',
      updatedAt: now,
    });
  }
  for (let i = 5; i <= 10; i++) {
    questions.push({
      id: `P2B-Q${i}`,
      section: 'P2B',
      number: i,
      label: `P2B-Q${i}`,
      status: 'unlogged',
      updatedAt: now,
    });
  }

  return questions;
}

export const QUESTION_STATUS_META: Record<
  QuestionMasteryStatus,
  {
    label: string;
    shortLabel: string;
    description: string;
    cardClass: string;
    pillClass: string;
    textClass: string;
  }
> = {
  unlogged: {
    label: 'Unlogged',
    shortLabel: 'Unlogged',
    description: 'Default before grading',
    cardClass:
      'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900',
    pillClass:
      'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600',
    textClass: 'text-slate-500 dark:text-slate-400',
  },
  mastered: {
    label: 'Mastered',
    shortLabel: 'Mastered',
    description: 'No Need to Redo',
    cardClass:
      'border-emerald-200 dark:border-emerald-800/70 bg-emerald-50/40 dark:bg-emerald-950/25',
    pillClass:
      'border-emerald-300 dark:border-emerald-700 bg-emerald-500/15 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300',
    textClass: 'text-emerald-700 dark:text-emerald-400',
  },
  redo: {
    label: 'Must Redo',
    shortLabel: 'Redo',
    description: 'Must Redo / Concept Gap',
    cardClass:
      'border-rose-300 dark:border-rose-800/80 bg-rose-50/50 dark:bg-rose-950/25',
    pillClass:
      'border-rose-400 dark:border-rose-700 bg-rose-500/15 dark:bg-rose-500/25 text-rose-800 dark:text-rose-300',
    textClass: 'text-rose-700 dark:text-rose-400',
  },
  silly: {
    label: 'Silly Mistake',
    shortLabel: 'Silly',
    description: 'Silly Mistake / Calc Error',
    cardClass:
      'border-amber-300 dark:border-amber-800/80 bg-amber-50/50 dark:bg-amber-950/25',
    pillClass:
      'border-amber-400 dark:border-amber-700 bg-amber-500/15 dark:bg-amber-500/25 text-amber-800 dark:text-amber-300',
    textClass: 'text-amber-700 dark:text-amber-400',
  },
  unattempted: {
    label: 'Skipped Choice',
    shortLabel: 'Skipped',
    description: 'Skipped Optional Choice',
    cardClass:
      'border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/40 opacity-80',
    pillClass:
      'border-dashed border-slate-300 dark:border-slate-600 bg-transparent text-slate-400 dark:text-slate-500',
    textClass: 'text-slate-400 dark:text-slate-500',
  },
};

export function nextMcqCycleStatus(
  current: QuestionMasteryStatus
): QuestionMasteryStatus {
  switch (current) {
    case 'unlogged':
      return 'redo';
    case 'redo':
      return 'silly';
    case 'silly':
      return 'mastered';
    case 'mastered':
      return 'unlogged';
    case 'unattempted':
      return 'redo';
  }
}

export interface PaperProgressStats {
  totalSlots: number;
  attemptedSlots: number;
  mastered: number;
  redo: number;
  silly: number;
  unlogged: number;
  unattempted: number;
  masteryPct: number;
}

export function computePaperStats(paper: PastPaperRecord): PaperProgressStats {
  let totalSlots = 0;
  let mastered = 0;
  let redo = 0;
  let silly = 0;
  let unlogged = 0;
  let unattempted = 0;

  for (const q of paper.questions) {
    if (q.subParts && q.subParts.length > 0) {
      for (const sp of q.subParts) {
        totalSlots += 1;
        if (sp.status === 'mastered') mastered += 1;
        else if (sp.status === 'redo') redo += 1;
        else if (sp.status === 'silly') silly += 1;
        else if (sp.status === 'unattempted') unattempted += 1;
        else unlogged += 1;
      }
    } else {
      totalSlots += 1;
      if (q.status === 'mastered') mastered += 1;
      else if (q.status === 'redo') redo += 1;
      else if (q.status === 'silly') silly += 1;
      else if (q.status === 'unattempted') unattempted += 1;
      else unlogged += 1;
    }
  }

  // Skipped optional questions ('unattempted') never penalize mastery %
  const gradableSlots = Math.max(0, totalSlots - unattempted);
  const attemptedSlots = mastered + redo + silly;
  const masteryPct =
    gradableSlots > 0 ? Math.round((mastered / gradableSlots) * 100) : 0;

  return {
    totalSlots,
    attemptedSlots,
    mastered,
    redo,
    silly,
    unlogged,
    unattempted,
    masteryPct,
  };
}

export function createInitialSubParts(question: PaperQuestion): QuestionSubPart[] {
  const now = new Date().toISOString();
  const baseStatus: QuestionMasteryStatus =
    question.status === 'unattempted' ? 'unattempted' : 'unlogged';
  return ['a', 'b', 'c'].map((letter, idx) => ({
    id: `${question.id}-${letter}`,
    label: letter,
    status: idx === 0 && question.status !== 'unlogged' ? question.status : baseStatus,
    syllabusUnit: idx === 0 ? question.syllabusUnit : undefined,
    mistakeNote: idx === 0 ? question.mistakeNote : undefined,
    redoneAt: idx === 0 ? question.redoneAt : undefined,
    updatedAt: now,
  }));
}

export interface RedoQueueEntry {
  key: string;
  paperId: string;
  paperTitle: string;
  paperMedium: PastPaperRecord['medium'];
  subject: ALSubjectKey;
  questionId: string;
  subPartId?: string;
  displayCode: string; // e.g., "P1-Q14" or "P2B-Q6(b)"
  section: string;
  status: QuestionMasteryStatus;
  syllabusUnit?: string;
  mistakeNote?: string;
  redoneAt?: string;
  updatedAt: string;
}

export function extractRedoQueueEntries(papers: PastPaperRecord[]): RedoQueueEntry[] {
  const entries: RedoQueueEntry[] = [];

  for (const paper of papers) {
    if (paper.deleted) continue;
    for (const q of paper.questions) {
      if (q.subParts && q.subParts.length > 0) {
        for (const sp of q.subParts) {
          if (sp.status === 'redo' || sp.status === 'silly' || (sp.status === 'mastered' && sp.redoneAt)) {
            entries.push({
              key: `${paper.id}::${q.id}::${sp.id}`,
              paperId: paper.id,
              paperTitle: paper.title,
              paperMedium: paper.medium,
              subject: paper.subject,
              questionId: q.id,
              subPartId: sp.id,
              displayCode: `${q.label}(${sp.label})`,
              section: q.section,
              status: sp.status,
              syllabusUnit: sp.syllabusUnit,
              mistakeNote: sp.mistakeNote,
              redoneAt: sp.redoneAt,
              updatedAt: sp.updatedAt,
            });
          }
        }
      } else if (q.status === 'redo' || q.status === 'silly' || (q.status === 'mastered' && q.redoneAt)) {
        entries.push({
          key: `${paper.id}::${q.id}`,
          paperId: paper.id,
          paperTitle: paper.title,
          paperMedium: paper.medium,
          subject: paper.subject,
          questionId: q.id,
          displayCode: q.label,
          section: q.section,
          status: q.status,
          syllabusUnit: q.syllabusUnit,
          mistakeNote: q.mistakeNote,
          redoneAt: q.redoneAt,
          updatedAt: q.updatedAt,
        });
      }
    }
  }

  return entries.sort((a, b) => {
    const rank = (s: QuestionMasteryStatus) => (s === 'redo' ? 0 : s === 'silly' ? 1 : 2);
    if (rank(a.status) !== rank(b.status)) return rank(a.status) - rank(b.status);
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}

export const OFFICIAL_YEARS: number[] = Array.from(
  { length: 2026 - 2010 + 1 },
  (_, i) => 2026 - i
);
