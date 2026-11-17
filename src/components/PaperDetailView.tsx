import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  Check,
  CheckCheck,
  AlertTriangle,
  Slash,
  Split,
  Plus,
  Send,
  Play,
  Trash2,
  X,
  StickyNote,
} from 'lucide-react';
import type {
  ALSubjectKey,
  PaperQuestion,
  PastPaperRecord,
  QuestionMasteryStatus,
  QuestionSubPart,
  Subject,
} from '../types';
import {
  QUESTION_STATUS_META,
  computePaperStats,
  createInitialSubParts,
  getSectionsForSubject,
  nextMcqCycleStatus,
  resolveALSubjectDisplay,
} from '../utils/pastPapers';
import { SyllabusUnitSelect } from './SyllabusUnitSelect';

interface PaperDetailViewProps {
  paper: PastPaperRecord;
  subjects: Subject[];
  onBack: () => void;
  onUpdatePaper: (
    paperId: string,
    updater: (prev: PastPaperRecord) => PastPaperRecord
  ) => void;
  onDeletePaper: (paperId: string) => void;
  onSendQuestionToTasks: (params: {
    subject: ALSubjectKey;
    paperTitle: string;
    questionCode: string;
    syllabusUnit?: string;
    mistakeNote?: string;
  }) => void;
  onStartRedoTimer: (params: {
    subject: ALSubjectKey;
    title: string;
  }) => void;
}

const STATUS_BUTTONS: Array<{
  status: QuestionMasteryStatus;
  shortLabel: string;
  activeClass: string;
}> = [
  {
    status: 'mastered',
    shortLabel: 'Mastered',
    activeClass:
      'border-emerald-500 bg-emerald-600 text-white dark:bg-emerald-600 dark:border-emerald-500',
  },
  {
    status: 'redo',
    shortLabel: 'Redo',
    activeClass:
      'border-rose-500 bg-rose-600 text-white dark:bg-rose-600 dark:border-rose-500',
  },
  {
    status: 'silly',
    shortLabel: 'Silly',
    activeClass:
      'border-amber-500 bg-amber-500 text-white dark:bg-amber-600 dark:border-amber-500',
  },
  {
    status: 'unattempted',
    shortLabel: 'Skip',
    activeClass:
      'border-slate-500 bg-slate-600 text-white dark:bg-slate-600 dark:border-slate-500',
  },
];

export const PaperDetailView: React.FC<PaperDetailViewProps> = ({
  paper,
  subjects,
  onBack,
  onUpdatePaper,
  onDeletePaper,
  onSendQuestionToTasks,
  onStartRedoTimer,
}) => {
  const [selectedMcqId, setSelectedMcqId] = useState<string | null>(null);
  const [editingScore, setEditingScore] = useState(false);
  const [draftAwarded, setDraftAwarded] = useState(
    paper.marksAwarded !== undefined ? String(paper.marksAwarded) : ''
  );
  const [draftMax, setDraftMax] = useState(
    paper.maxMarks !== undefined ? String(paper.maxMarks) : ''
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [feedbackBanner, setFeedbackBanner] = useState<string | null>(null);

  const subjectDisplay = resolveALSubjectDisplay(paper.subject, subjects);
  const sections = useMemo(
    () => getSectionsForSubject(paper.subject),
    [paper.subject]
  );
  const stats = useMemo(() => computePaperStats(paper), [paper]);

  const showToast = (msg: string) => {
    setFeedbackBanner(msg);
    window.setTimeout(() => {
      setFeedbackBanner((cur) => (cur === msg ? null : cur));
    }, 2400);
  };

  const updateQuestion = (
    questionId: string,
    patch: Partial<PaperQuestion>
  ) => {
    const now = new Date().toISOString();
    onUpdatePaper(paper.id, (prev) => ({
      ...prev,
      updatedAt: now,
      questions: prev.questions.map((q) =>
        q.id === questionId ? { ...q, ...patch, updatedAt: now } : q
      ),
    }));
  };

  const updateSubPart = (
    questionId: string,
    subPartId: string,
    patch: Partial<QuestionSubPart>
  ) => {
    const now = new Date().toISOString();
    onUpdatePaper(paper.id, (prev) => ({
      ...prev,
      updatedAt: now,
      questions: prev.questions.map((q) => {
        if (q.id !== questionId || !q.subParts) return q;
        return {
          ...q,
          updatedAt: now,
          subParts: q.subParts.map((sp) =>
            sp.id === subPartId ? { ...sp, ...patch, updatedAt: now } : sp
          ),
        };
      }),
    }));
  };

  const handleMarkSectionRemaining = (
    sectionId: string,
    targetStatus: QuestionMasteryStatus
  ) => {
    const now = new Date().toISOString();
    onUpdatePaper(paper.id, (prev) => ({
      ...prev,
      updatedAt: now,
      questions: prev.questions.map((q) => {
        if (q.section !== sectionId) return q;
        if (q.subParts && q.subParts.length > 0) {
          return {
            ...q,
            updatedAt: now,
            subParts: q.subParts.map((sp) =>
              sp.status === 'unlogged'
                ? { ...sp, status: targetStatus, updatedAt: now }
                : sp
            ),
          };
        }
        if (q.status === 'unlogged') {
          return { ...q, status: targetStatus, updatedAt: now };
        }
        return q;
      }),
    }));
  };

  const handleToggleSubParts = (question: PaperQuestion) => {
    const now = new Date().toISOString();
    if (question.subParts && question.subParts.length > 0) {
      // Collapse back: preserve worst/notable status if any sub-part was flagged
      const hasRedo = question.subParts.find((sp) => sp.status === 'redo');
      const hasSilly = question.subParts.find((sp) => sp.status === 'silly');
      const hasMastered = question.subParts.every((sp) => sp.status === 'mastered');
      const hasUnattempted = question.subParts.every((sp) => sp.status === 'unattempted');
      const mergedStatus: QuestionMasteryStatus = hasRedo
        ? 'redo'
        : hasSilly
        ? 'silly'
        : hasMastered
        ? 'mastered'
        : hasUnattempted
        ? 'unattempted'
        : 'unlogged';
      const firstFlagged = hasRedo || hasSilly || question.subParts[0];
      updateQuestion(question.id, {
        status: mergedStatus,
        syllabusUnit: firstFlagged?.syllabusUnit || question.syllabusUnit,
        mistakeNote: firstFlagged?.mistakeNote || question.mistakeNote,
        subParts: undefined,
      });
    } else {
      updateQuestion(question.id, {
        subParts: createInitialSubParts(question),
        updatedAt: now,
      });
    }
  };

  const handleAddExtraSubPart = (question: PaperQuestion) => {
    if (!question.subParts) return;
    const letters = ['a', 'b', 'c', 'd', 'e', 'f'];
    const nextLetter = letters[question.subParts.length];
    if (!nextLetter) return;
    const now = new Date().toISOString();
    updateQuestion(question.id, {
      subParts: [
        ...question.subParts,
        {
          id: `${question.id}-${nextLetter}`,
          label: nextLetter,
          status: 'unlogged',
          updatedAt: now,
        },
      ],
    });
  };

  const handleSaveScore = (e: React.FormEvent) => {
    e.preventDefault();
    const awarded =
      draftAwarded.trim() !== '' ? Number(draftAwarded) : undefined;
    const max = draftMax.trim() !== '' ? Number(draftMax) : undefined;
    onUpdatePaper(paper.id, (prev) => ({
      ...prev,
      marksAwarded:
        awarded !== undefined && Number.isFinite(awarded) ? awarded : undefined,
      maxMarks: max !== undefined && Number.isFinite(max) ? max : undefined,
      updatedAt: new Date().toISOString(),
    }));
    setEditingScore(false);
  };

  const selectedMcq = useMemo(
    () =>
      selectedMcqId
        ? paper.questions.find((q) => q.id === selectedMcqId) || null
        : null,
    [paper.questions, selectedMcqId]
  );

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb & Paper Header */}
      <div className="flex flex-col gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>All Papers</span>
          </button>

          <div className="flex items-center gap-2">
            {feedbackBanner && (
              <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                {feedbackBanner}
              </span>
            )}
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 hover:border-rose-300 dark:hover:border-rose-800 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete Paper</span>
            </button>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div className="space-y-1.5 min-w-0">
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span
                className="w-2.5 h-2.5 rounded-xs shrink-0"
                style={{ backgroundColor: subjectDisplay.color }}
              />
              <span className="font-medium text-slate-700 dark:text-slate-300">
                {subjectDisplay.label}
              </span>
              <span aria-hidden="true">·</span>
              <span>
                {paper.category === 'official'
                  ? `Official A/L${paper.year ? ` (${paper.year})` : ''}`
                  : 'Term / Model Paper'}
              </span>
              <span aria-hidden="true">·</span>
              <span>{paper.medium === 'sinhala' ? 'Sinhala Medium' : 'English Medium'}</span>
            </div>

            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100 break-words">
              {paper.title}
            </h1>
          </div>

          {/* Score & Progress Summary */}
          <div className="flex flex-wrap items-center gap-4">
            {editingScore ? (
              <form onSubmit={handleSaveScore} className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={draftAwarded}
                  onChange={(e) => setDraftAwarded(e.target.value)}
                  placeholder="Marks"
                  className="w-16 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-xs font-mono tabular-nums"
                />
                <span className="text-xs text-slate-400">/</span>
                <input
                  type="number"
                  min={1}
                  step="any"
                  value={draftMax}
                  onChange={(e) => setDraftMax(e.target.value)}
                  placeholder="100"
                  className="w-16 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-xs font-mono tabular-nums"
                />
                <button
                  type="submit"
                  className="rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-medium text-white cursor-pointer"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setEditingScore(false)}
                  className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setDraftAwarded(
                    paper.marksAwarded !== undefined ? String(paper.marksAwarded) : ''
                  );
                  setDraftMax(
                    paper.maxMarks !== undefined ? String(paper.maxMarks) : ''
                  );
                  setEditingScore(true);
                }}
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-mono tabular-nums text-slate-700 dark:text-slate-200 hover:border-slate-300 dark:hover:border-slate-700 cursor-pointer"
              >
                {paper.marksAwarded !== undefined
                  ? `Score: ${paper.marksAwarded}${
                      paper.maxMarks ? ` / ${paper.maxMarks}` : ''
                    }`
                  : '+ Add Score'}
              </button>
            )}

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-mono tabular-nums">
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                {stats.masteryPct}% Mastered
              </span>
              <span className="text-slate-400">·</span>
              <span className="text-emerald-700 dark:text-emerald-400">
                {stats.mastered} ok
              </span>
              <span className="text-rose-600 dark:text-rose-400">
                {stats.redo} redo
              </span>
              <span className="text-amber-600 dark:text-amber-400">
                {stats.silly} silly
              </span>
              <span className="text-slate-500 dark:text-slate-400">
                {stats.unlogged} unlogged
              </span>
              {stats.unattempted > 0 && (
                <span className="text-slate-400 dark:text-slate-500">
                  {stats.unattempted} skipped
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Sections */}
      <div className="space-y-8">
        {sections.map((section) => {
          const secQuestions = paper.questions.filter(
            (q) => q.section === section.id
          );
          const secUnloggedCount = secQuestions.filter((q) => {
            if (q.subParts && q.subParts.length > 0) {
              return q.subParts.some((sp) => sp.status === 'unlogged');
            }
            return q.status === 'unlogged';
          }).length;

          if (section.isMcqGrid) {
            return (
              <section
                key={section.id}
                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-6 space-y-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                      {section.title}
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {section.subtitle} · Tap number to cycle (Unlogged → Redo → Silly → Mastered)
                    </p>
                  </div>

                  <button
                    type="button"
                    disabled={secUnloggedCount === 0}
                    onClick={() => handleMarkSectionRemaining(section.id, 'mastered')}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-45 disabled:cursor-not-allowed px-3.5 py-2 text-xs font-semibold text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                    <span>Mark Remaining as Mastered ({secUnloggedCount})</span>
                  </button>
                </div>

                {/* 10-Column MCQ Tap-Grid */}
                <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5 sm:gap-2">
                  {secQuestions.map((q) => {
                    const meta = QUESTION_STATUS_META[q.status];
                    const isSelected = selectedMcqId === q.id;
                    const hasDetail = !!(q.syllabusUnit || q.mistakeNote);

                    return (
                      <button
                        key={q.id}
                        type="button"
                        onClick={() => {
                          const nextStatus = nextMcqCycleStatus(q.status);
                          updateQuestion(q.id, { status: nextStatus });
                          setSelectedMcqId(q.id);
                        }}
                        className={`relative flex flex-col items-center justify-center min-h-[44px] rounded-xl border px-1 py-1.5 text-xs font-mono tabular-nums font-semibold transition-all cursor-pointer select-none ${meta.pillClass} ${
                          isSelected
                            ? 'ring-2 ring-blue-500 ring-offset-1 dark:ring-offset-slate-900'
                            : ''
                        }`}
                        title={`${q.label}: ${meta.label}${
                          q.syllabusUnit ? ` · ${q.syllabusUnit}` : ''
                        }`}
                        aria-label={`${q.label} status ${meta.label}`}
                      >
                        <span>{q.number}</span>
                        <span className="text-[10px] leading-none mt-0.5 font-sans font-medium opacity-85">
                          {q.status === 'mastered'
                            ? q.redoneAt
                              ? 'Redone'
                              : 'OK'
                            : q.status === 'redo'
                            ? 'Redo'
                            : q.status === 'silly'
                            ? 'Silly'
                            : q.status === 'unattempted'
                            ? 'Skip'
                            : '·'}
                        </span>
                        {hasDetail && (
                          <StickyNote className="w-2.5 h-2.5 absolute top-1 right-1 opacity-70" />
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Non-blocking Quick-Popover / Inspector for Selected MCQ */}
                {selectedMcq && selectedMcq.section === section.id && (
                  <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/70 p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                          {selectedMcq.label}
                        </span>
                        <span aria-hidden="true" className="text-slate-400">
                          ·
                        </span>
                        <span
                          className={`font-medium ${
                            QUESTION_STATUS_META[selectedMcq.status].textClass
                          }`}
                        >
                          {QUESTION_STATUS_META[selectedMcq.status].description}
                        </span>
                        {selectedMcq.status === 'mastered' && selectedMcq.redoneAt && (
                          <>
                            <span aria-hidden="true" className="text-slate-400">
                              ·
                            </span>
                            <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                              Cleared on Redo
                            </span>
                          </>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedMcqId(null)}
                        className="p-1 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                        aria-label="Close question inspector"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Direct 5-State Picker */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      {(
                        [
                          'unlogged',
                          'mastered',
                          'redo',
                          'silly',
                          'unattempted',
                        ] as QuestionMasteryStatus[]
                      ).map((st) => {
                        const active = selectedMcq.status === st;
                        const label = QUESTION_STATUS_META[st].label;
                        return (
                          <button
                            key={st}
                            type="button"
                            onClick={() => updateQuestion(selectedMcq.id, { status: st })}
                            className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                              active
                                ? 'border-blue-600 bg-blue-600 text-white'
                                : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600'
                            }`}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>

                    {/* Syllabus Unit & Unicode Mistake Note */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                          Syllabus Unit
                        </label>
                        <SyllabusUnitSelect
                          subject={paper.subject}
                          value={selectedMcq.syllabusUnit}
                          onChange={(unit) =>
                            updateQuestion(selectedMcq.id, { syllabusUnit: unit })
                          }
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                          Mistake Note (English / සිංහල)
                        </label>
                        <input
                          type="text"
                          value={selectedMcq.mistakeNote || ''}
                          onChange={(e) =>
                            updateQuestion(selectedMcq.id, {
                              mistakeNote: e.target.value,
                            })
                          }
                          placeholder="e.g., Forgot sign flip or සමීකරණය වැරදියි..."
                          className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
                        />
                      </div>
                    </div>

                    {(selectedMcq.status === 'redo' || selectedMcq.status === 'silly') && (
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            updateQuestion(selectedMcq.id, {
                              status: 'mastered',
                              redoneAt: new Date().toISOString(),
                            });
                            showToast(`${selectedMcq.label} cleared on redo`);
                          }}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Mark Redone &amp; Mastered</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            onSendQuestionToTasks({
                              subject: paper.subject,
                              paperTitle: paper.title,
                              questionCode: selectedMcq.label,
                              syllabusUnit: selectedMcq.syllabusUnit,
                              mistakeNote: selectedMcq.mistakeNote,
                            });
                            showToast(`Sent ${selectedMcq.label} to Study Tasks`);
                          }}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>Send to Tasks</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            onStartRedoTimer({
                              subject: paper.subject,
                              title: `Redo ${paper.title} · ${selectedMcq.label}${
                                selectedMcq.syllabusUnit ? ` (${selectedMcq.syllabusUnit})` : ''
                              }`,
                            })
                          }
                          className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/70 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/50 px-3 py-1.5 text-xs font-medium text-blue-700 dark:text-blue-300 cursor-pointer"
                        >
                          <Play className="w-3.5 h-3.5" />
                          <span>Start Redo Session</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </section>
            );
          }

          // Structured & Essay Section
          return (
            <section key={section.id} className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    {section.title}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {section.subtitle}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {section.optionalTargetCount && (
                    <button
                      type="button"
                      disabled={secUnloggedCount === 0}
                      onClick={() =>
                        handleMarkSectionRemaining(section.id, 'unattempted')
                      }
                      className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    >
                      <Slash className="w-3.5 h-3.5" />
                      <span>Skip Remaining Optional</span>
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={secUnloggedCount === 0}
                    onClick={() => handleMarkSectionRemaining(section.id, 'mastered')}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/35 px-3 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                    <span>Mark Remaining Mastered ({secUnloggedCount})</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2.5">
                {secQuestions.map((q) => {
                  const isSplit = !!(q.subParts && q.subParts.length > 0);
                  const meta = QUESTION_STATUS_META[q.status];
                  const needsExpansion =
                    !isSplit && (q.status === 'redo' || q.status === 'silly');

                  return (
                    <div
                      key={q.id}
                      className={`rounded-2xl border p-3.5 sm:p-4 transition-colors ${
                        isSplit
                          ? 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                          : meta.cardClass
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-2 min-w-0">
                          <span className="font-mono text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                            {q.label}
                          </span>

                          {!isSplit && (
                            <>
                              <span aria-hidden="true" className="text-slate-400 text-xs">
                                ·
                              </span>
                              <span className={`text-xs font-medium ${meta.textClass}`}>
                                {meta.label}
                              </span>
                            </>
                          )}

                          {!isSplit && q.status === 'mastered' && q.redoneAt && (
                            <>
                              <span aria-hidden="true" className="text-slate-400 text-xs">
                                ·
                              </span>
                              <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                                Cleared on Redo
                              </span>
                            </>
                          )}

                          {!isSplit && q.syllabusUnit && (
                            <>
                              <span aria-hidden="true" className="text-slate-400 text-xs">
                                ·
                              </span>
                              <span className="text-xs text-slate-600 dark:text-slate-300 truncate">
                                {q.syllabusUnit}
                              </span>
                            </>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                          {!isSplit && (
                            <div className="flex flex-wrap items-center gap-1">
                              {STATUS_BUTTONS.map((btn) => {
                                const active = q.status === btn.status;
                                return (
                                  <button
                                    key={btn.status}
                                    type="button"
                                    onClick={() =>
                                      updateQuestion(q.id, {
                                        status: active ? 'unlogged' : btn.status,
                                      })
                                    }
                                    className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                                      active
                                        ? btn.activeClass
                                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600'
                                    }`}
                                  >
                                    {btn.shortLabel}
                                  </button>
                                );
                              })}
                            </div>
                          )}

                          <button
                            type="button"
                            onClick={() => handleToggleSubParts(q)}
                            className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                              isSplit
                                ? 'border-blue-300 dark:border-blue-800 bg-blue-50/70 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                                : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                            }`}
                            title={
                              isSplit
                                ? 'Collapse sub-parts back to single question'
                                : 'Split into sub-parts (a, b, c)'
                            }
                          >
                            <Split className="w-3.5 h-3.5" />
                            <span>{isSplit ? 'Merge Parts' : 'Split (+ a, b, c)'}</span>
                          </button>
                        </div>
                      </div>

                      {/* Auto-expanded Details for Whole Question Redo / Silly */}
                      {needsExpansion && (
                        <div className="mt-3 pt-3 border-t border-slate-200/70 dark:border-slate-800 space-y-3">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                                Syllabus Unit
                              </label>
                              <SyllabusUnitSelect
                                subject={paper.subject}
                                value={q.syllabusUnit}
                                onChange={(unit) =>
                                  updateQuestion(q.id, { syllabusUnit: unit })
                                }
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                                Mistake Note (English / සිංහල)
                              </label>
                              <input
                                type="text"
                                value={q.mistakeNote || ''}
                                onChange={(e) =>
                                  updateQuestion(q.id, {
                                    mistakeNote: e.target.value,
                                  })
                                }
                                placeholder="Note the concept gap or calc error..."
                                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
                              />
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                updateQuestion(q.id, {
                                  status: 'mastered',
                                  redoneAt: new Date().toISOString(),
                                });
                                showToast(`${q.label} cleared on redo`);
                              }}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white cursor-pointer"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Mark Redone &amp; Mastered</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                onSendQuestionToTasks({
                                  subject: paper.subject,
                                  paperTitle: paper.title,
                                  questionCode: q.label,
                                  syllabusUnit: q.syllabusUnit,
                                  mistakeNote: q.mistakeNote,
                                });
                                showToast(`Sent ${q.label} to Study Tasks`);
                              }}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 hover:bg-slate-50 dark:hover:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
                            >
                              <Send className="w-3.5 h-3.5" />
                              <span>Send to Tasks</span>
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                onStartRedoTimer({
                                  subject: paper.subject,
                                  title: `Redo ${paper.title} · ${q.label}${
                                    q.syllabusUnit ? ` (${q.syllabusUnit})` : ''
                                  }`,
                                })
                              }
                              className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/70 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/50 px-3 py-1.5 text-xs font-medium text-blue-700 dark:text-blue-300 cursor-pointer"
                            >
                              <Play className="w-3.5 h-3.5" />
                              <span>Start Redo Session</span>
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Split Sub-parts List (a, b, c...) */}
                      {isSplit && q.subParts && (
                        <div className="mt-3 pt-3 border-t border-slate-200/80 dark:border-slate-800 divide-y divide-slate-200/70 dark:divide-slate-800">
                          {q.subParts.map((sp) => {
                            const spMeta = QUESTION_STATUS_META[sp.status];
                            const spExpanded =
                              sp.status === 'redo' || sp.status === 'silly';
                            return (
                              <div key={sp.id} className="py-2.5 first:pt-0 last:pb-0 space-y-2.5">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                  <div className="flex flex-wrap items-center gap-2 text-xs">
                                    <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                                      {q.number}({sp.label})
                                    </span>
                                    <span aria-hidden="true" className="text-slate-400">
                                      ·
                                    </span>
                                    <span className={`font-medium ${spMeta.textClass}`}>
                                      {spMeta.label}
                                    </span>
                                    {sp.status === 'mastered' && sp.redoneAt && (
                                      <>
                                        <span aria-hidden="true" className="text-slate-400">
                                          ·
                                        </span>
                                        <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                                          Cleared on Redo
                                        </span>
                                      </>
                                    )}
                                    {sp.syllabusUnit && (
                                      <>
                                        <span aria-hidden="true" className="text-slate-400">
                                          ·
                                        </span>
                                        <span className="text-slate-600 dark:text-slate-300">
                                          {sp.syllabusUnit}
                                        </span>
                                      </>
                                    )}
                                  </div>

                                  <div className="flex flex-wrap items-center gap-1">
                                    {STATUS_BUTTONS.map((btn) => {
                                      const active = sp.status === btn.status;
                                      return (
                                        <button
                                          key={btn.status}
                                          type="button"
                                          onClick={() =>
                                            updateSubPart(q.id, sp.id, {
                                              status: active ? 'unlogged' : btn.status,
                                            })
                                          }
                                          className={`rounded-lg border px-2 py-1 text-xs font-medium transition-colors cursor-pointer ${
                                            active
                                              ? btn.activeClass
                                              : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600'
                                          }`}
                                        >
                                          {btn.shortLabel}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>

                                {spExpanded && (
                                  <div className="pl-3 space-y-2.5">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                      <div>
                                        <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                                          Syllabus Unit
                                        </label>
                                        <SyllabusUnitSelect
                                          subject={paper.subject}
                                          value={sp.syllabusUnit}
                                          onChange={(unit) =>
                                            updateSubPart(q.id, sp.id, {
                                              syllabusUnit: unit,
                                            })
                                          }
                                        />
                                      </div>
                                      <div>
                                        <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                                          Mistake Note (English / සිංහල)
                                        </label>
                                        <input
                                          type="text"
                                          value={sp.mistakeNote || ''}
                                          onChange={(e) =>
                                            updateSubPart(q.id, sp.id, {
                                              mistakeNote: e.target.value,
                                            })
                                          }
                                          placeholder="Sub-part mistake note..."
                                          className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
                                        />
                                      </div>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-2">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          updateSubPart(q.id, sp.id, {
                                            status: 'mastered',
                                            redoneAt: new Date().toISOString(),
                                          });
                                          showToast(
                                            `${q.label}(${sp.label}) cleared on redo`
                                          );
                                        }}
                                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-2.5 py-1 text-xs font-medium text-white cursor-pointer"
                                      >
                                        <Check className="w-3 h-3" />
                                        <span>Mark Redone &amp; Mastered</span>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          onSendQuestionToTasks({
                                            subject: paper.subject,
                                            paperTitle: paper.title,
                                            questionCode: `${q.label}(${sp.label})`,
                                            syllabusUnit: sp.syllabusUnit,
                                            mistakeNote: sp.mistakeNote,
                                          });
                                          showToast(
                                            `Sent ${q.label}(${sp.label}) to Study Tasks`
                                          );
                                        }}
                                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
                                      >
                                        <Send className="w-3 h-3" />
                                        <span>Send to Tasks</span>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          onStartRedoTimer({
                                            subject: paper.subject,
                                            title: `Redo ${paper.title} · ${q.label}(${sp.label})${
                                              sp.syllabusUnit ? ` (${sp.syllabusUnit})` : ''
                                            }`,
                                          })
                                        }
                                        className="inline-flex items-center gap-1 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/70 dark:bg-blue-950/40 px-2.5 py-1 text-xs font-medium text-blue-700 dark:text-blue-300 cursor-pointer"
                                      >
                                        <Play className="w-3 h-3" />
                                        <span>Start Redo Session</span>
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}

                          {q.subParts.length < 6 && (
                            <div className="pt-2">
                              <button
                                type="button"
                                onClick={() => handleAddExtraSubPart(q)}
                                className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                <span>
                                  Add part ({['a', 'b', 'c', 'd', 'e', 'f'][q.subParts.length]})
                                </span>
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {/* Delete Confirmation Modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4 shadow-2xl">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Delete Past Paper?
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                  Remove <strong>{paper.title}</strong> and its logged question history? This will also sync to Google Drive on next sync.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="rounded-lg border border-slate-200 dark:border-slate-700 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmDelete(false);
                  onDeletePaper(paper.id);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 px-3.5 py-2 text-xs font-medium text-white cursor-pointer"
              >
                <span>Delete Paper</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
