import React, { useState } from 'react';
import { X } from 'lucide-react';
import type {
  ALSubjectKey,
  PaperCategory,
  PaperMedium,
  PastPaperRecord,
  Subject,
} from '../types';
import {
  AL_SUBJECT_LIST,
  OFFICIAL_YEARS,
  generatePaperQuestions,
  resolveALSubjectDisplay,
} from '../utils/pastPapers';

interface AddPaperModalProps {
  isOpen: boolean;
  onClose: () => void;
  subjects: Subject[];
  defaultSubject?: ALSubjectKey;
  onCreatePaper: (paper: PastPaperRecord) => void;
}

export const AddPaperModal: React.FC<AddPaperModalProps> = ({
  isOpen,
  onClose,
  subjects,
  defaultSubject = 'physics',
  onCreatePaper,
}) => {
  const [subject, setSubject] = useState<ALSubjectKey>(defaultSubject);
  const [category, setCategory] = useState<PaperCategory>('official');
  const [year, setYear] = useState<number>(2024);
  const [customTitle, setCustomTitle] = useState('');
  const [medium, setMedium] = useState<PaperMedium>('english');
  const [marksAwarded, setMarksAwarded] = useState('');
  const [maxMarks, setMaxMarks] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedTitle = customTitle.trim();
    if (category === 'term' && !trimmedTitle) {
      setError('Please enter a paper title (Sinhala or English).');
      return;
    }

    const parsedAwarded =
      marksAwarded.trim() !== '' ? Number(marksAwarded) : undefined;
    const parsedMax = maxMarks.trim() !== '' ? Number(maxMarks) : undefined;

    if (
      (parsedAwarded !== undefined && (!Number.isFinite(parsedAwarded) || parsedAwarded < 0)) ||
      (parsedMax !== undefined && (!Number.isFinite(parsedMax) || parsedMax <= 0))
    ) {
      setError('Enter valid non-negative numeric scores.');
      return;
    }

    const now = new Date().toISOString();
    const resolvedTitle =
      category === 'official'
        ? trimmedTitle
          ? `${year} A/L · ${trimmedTitle}`
          : `${year} A/L Past Paper`
        : trimmedTitle;

    const newPaper: PastPaperRecord = {
      id: `paper-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      subject,
      category,
      year: category === 'official' ? year : undefined,
      title: resolvedTitle,
      medium,
      marksAwarded: parsedAwarded,
      maxMarks: parsedMax,
      questions: generatePaperQuestions(subject),
      createdAt: now,
      updatedAt: now,
    };

    onCreatePaper(newPaper);
    setCustomTitle('');
    setMarksAwarded('');
    setMaxMarks('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-xs p-0 sm:p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5 shadow-2xl"
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Add Past Paper
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Auto-generates the G.C.E. A/L question structure for fast error logging
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Subject Picker */}
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
            Subject
          </label>
          <div className="grid grid-cols-3 gap-2">
            {AL_SUBJECT_LIST.map((cfg) => {
              const display = resolveALSubjectDisplay(cfg.key, subjects);
              const active = subject === cfg.key;
              return (
                <button
                  key={cfg.key}
                  type="button"
                  onClick={() => setSubject(cfg.key)}
                  className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                    active
                      ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-950/40 text-slate-900 dark:text-slate-100'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600'
                  }`}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-xs shrink-0"
                    style={{ backgroundColor: display.color }}
                  />
                  <span>{cfg.shortLabel}</span>
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {subject === 'combined'
              ? 'Skeleton: Pure Part A (10), Pure Part B (7), Applied Part A (10), Applied Part B (7)'
              : 'Skeleton: Paper I MCQ (50), Paper II Part A (4), Paper II Part B (6)'}
          </p>
        </div>

        {/* Category Toggle */}
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
            Paper Category
          </label>
          <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200/70 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setCategory('official')}
              className={`rounded-lg py-2 px-3 text-xs font-medium transition-colors cursor-pointer ${
                category === 'official'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Official A/L Past Paper
            </button>
            <button
              type="button"
              onClick={() => setCategory('term')}
              className={`rounded-lg py-2 px-3 text-xs font-medium transition-colors cursor-pointer ${
                category === 'term'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Term / Model / School
            </button>
          </div>
        </div>

        {/* Year / Custom Title */}
        {category === 'official' ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Exam Year
              </label>
              <select
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono tabular-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                {OFFICIAL_YEARS.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Optional Note / Attempt Label
              </label>
              <input
                type="text"
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                placeholder="e.g., New Syllabus / Attempt 2"
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
          </div>
        ) : (
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
              Paper Title (English or Sinhala Unicode)
            </label>
            <input
              type="text"
              required
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
              placeholder="e.g., FWC 3rd Term 2025 or රාජකීය විද්‍යාලය 2024"
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
        )}

        {/* Medium & Optional Score */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
              Medium
            </label>
            <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200/70 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setMedium('english')}
                className={`rounded-lg py-1.5 px-3 text-xs font-medium transition-colors cursor-pointer ${
                  medium === 'english'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                English
              </button>
              <button
                type="button"
                onClick={() => setMedium('sinhala')}
                className={`rounded-lg py-1.5 px-3 text-xs font-medium transition-colors cursor-pointer ${
                  medium === 'sinhala'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                සිංහල (Sinhala)
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
              Score Summary (Optional)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                step="any"
                value={marksAwarded}
                onChange={(e) => setMarksAwarded(e.target.value)}
                placeholder="Marks"
                aria-label="Marks awarded"
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-1.5 text-sm font-mono tabular-nums text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
              />
              <span className="text-slate-400 text-xs">/</span>
              <input
                type="number"
                min={1}
                step="any"
                value={maxMarks}
                onChange={(e) => setMaxMarks(e.target.value)}
                placeholder="100"
                aria-label="Maximum marks"
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-1.5 text-sm font-mono tabular-nums text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
              />
            </div>
          </div>
        </div>

        {error && (
          <p className="text-xs font-medium text-rose-600 dark:text-rose-400">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded-lg bg-blue-600 hover:bg-blue-700 px-4 py-2 text-xs font-semibold text-white cursor-pointer"
          >
            Create Paper
          </button>
        </div>
      </form>
    </div>
  );
};
