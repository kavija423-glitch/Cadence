import React, { useMemo, useState } from 'react';
import {
  Check,
  ExternalLink,
  Play,
  Send,
  Filter,
} from 'lucide-react';
import type { ALSubjectKey, PastPaperRecord, Subject } from '../types';
import {
  AL_SUBJECT_LIST,
  QUESTION_STATUS_META,
  SYLLABUS_UNITS,
  extractRedoQueueEntries,
  resolveALSubjectDisplay,
  type RedoQueueEntry,
} from '../utils/pastPapers';

type QueueStatusFilter = 'flagged' | 'redo' | 'silly' | 'cleared';

interface RedoQueueViewProps {
  papers: PastPaperRecord[];
  subjects: Subject[];
  onOpenPaper: (paperId: string) => void;
  onMarkRedoneMastered: (
    paperId: string,
    questionId: string,
    subPartId?: string
  ) => void;
  onSendQuestionToTasks: (params: {
    subject: ALSubjectKey;
    paperTitle: string;
    questionCode: string;
    syllabusUnit?: string;
    mistakeNote?: string;
  }) => void;
  onSendBatchToTasks: (entries: RedoQueueEntry[]) => void;
  onStartRedoTimer: (params: {
    subject: ALSubjectKey;
    title: string;
  }) => void;
}

export const RedoQueueView: React.FC<RedoQueueViewProps> = ({
  papers,
  subjects,
  onOpenPaper,
  onMarkRedoneMastered,
  onSendQuestionToTasks,
  onSendBatchToTasks,
  onStartRedoTimer,
}) => {
  const [subjectFilter, setSubjectFilter] = useState<'all' | ALSubjectKey>('all');
  const [unitFilter, setUnitFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<QueueStatusFilter>('flagged');
  const [recentlyClearedKeys, setRecentlyClearedKeys] = useState<Record<string, boolean>>({});
  const [feedbackBanner, setFeedbackBanner] = useState<string | null>(null);

  const allEntries = useMemo(() => extractRedoQueueEntries(papers), [papers]);

  const showToast = (msg: string) => {
    setFeedbackBanner(msg);
    window.setTimeout(() => {
      setFeedbackBanner((cur) => (cur === msg ? null : cur));
    }, 2600);
  };

  // Available syllabus units based on subject filter + logged units
  const availableUnits = useMemo(() => {
    const set = new Set<string>();
    if (subjectFilter === 'all') {
      for (const cfg of AL_SUBJECT_LIST) {
        for (const u of SYLLABUS_UNITS[cfg.key]) set.add(u);
      }
    } else {
      for (const u of SYLLABUS_UNITS[subjectFilter]) set.add(u);
    }
    for (const e of allEntries) {
      if (
        e.syllabusUnit &&
        (subjectFilter === 'all' || e.subject === subjectFilter)
      ) {
        set.add(e.syllabusUnit);
      }
    }
    return Array.from(set);
  }, [allEntries, subjectFilter]);

  const counts = useMemo(() => {
    const bySubj = allEntries.filter(
      (e) => subjectFilter === 'all' || e.subject === subjectFilter
    );
    return {
      flagged: bySubj.filter((e) => e.status === 'redo' || e.status === 'silly').length,
      redo: bySubj.filter((e) => e.status === 'redo').length,
      silly: bySubj.filter((e) => e.status === 'silly').length,
      cleared: bySubj.filter((e) => e.status === 'mastered' && !!e.redoneAt).length,
    };
  }, [allEntries, subjectFilter]);

  const filteredEntries = useMemo(() => {
    return allEntries.filter((e) => {
      if (subjectFilter !== 'all' && e.subject !== subjectFilter) return false;
      if (unitFilter !== 'all' && (e.syllabusUnit || '') !== unitFilter) {
        return false;
      }

      if (statusFilter === 'cleared') {
        return e.status === 'mastered' && !!e.redoneAt;
      }
      // Keep items cleared during this view session visible with 'Cleared on Redo' badge
      if (recentlyClearedKeys[e.key] && e.status === 'mastered') {
        return true;
      }
      if (statusFilter === 'redo') return e.status === 'redo';
      if (statusFilter === 'silly') return e.status === 'silly';
      return e.status === 'redo' || e.status === 'silly';
    });
  }, [allEntries, subjectFilter, unitFilter, statusFilter, recentlyClearedKeys]);

  const activeFlaggedInFilter = useMemo(
    () =>
      filteredEntries.filter((e) => e.status === 'redo' || e.status === 'silly'),
    [filteredEntries]
  );

  const handleBatchSendToTasks = () => {
    if (activeFlaggedInFilter.length === 0) return;
    onSendBatchToTasks(activeFlaggedInFilter);
    showToast(
      `Added ${activeFlaggedInFilter.length} item${
        activeFlaggedInFilter.length === 1 ? '' : 's'
      } to Study Tasks`
    );
  };

  const handleBatchStartTimer = () => {
    if (activeFlaggedInFilter.length === 0) return;
    const first = activeFlaggedInFilter[0];
    const unitLabel =
      unitFilter !== 'all'
        ? unitFilter
        : first.syllabusUnit || 'Mixed Topics';
    const codes = activeFlaggedInFilter
      .slice(0, 3)
      .map((e) => e.displayCode)
      .join(', ');
    const more =
      activeFlaggedInFilter.length > 3
        ? ` +${activeFlaggedInFilter.length - 3}`
        : '';
    onStartRedoTimer({
      subject: subjectFilter !== 'all' ? subjectFilter : first.subject,
      title: `Redo ${codes}${more} (${unitLabel})`,
    });
  };

  return (
    <div className="space-y-5">
      {/* Filter Toolbar */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Status Filter Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto p-1 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200/70 dark:border-slate-800">
            {(
              [
                { id: 'flagged', label: 'All Flagged', count: counts.flagged },
                { id: 'redo', label: 'Must Redo', count: counts.redo },
                { id: 'silly', label: 'Silly Mistake', count: counts.silly },
                { id: 'cleared', label: 'Cleared on Redo', count: counts.cleared },
              ] as Array<{ id: QueueStatusFilter; label: string; count: number }>
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  statusFilter === tab.id
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

          {/* Subject & Unit Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 mr-1">
              <Filter className="w-3.5 h-3.5" />
              <span>Filter:</span>
            </div>

            <select
              value={subjectFilter}
              onChange={(e) => {
                setSubjectFilter(e.target.value as 'all' | ALSubjectKey);
                setUnitFilter('all');
              }}
              aria-label="Filter queue by subject"
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="all">All Subjects</option>
              {AL_SUBJECT_LIST.map((cfg) => (
                <option key={cfg.key} value={cfg.key}>
                  {cfg.label}
                </option>
              ))}
            </select>

            <select
              value={unitFilter}
              onChange={(e) => setUnitFilter(e.target.value)}
              aria-label="Filter queue by syllabus unit"
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 max-w-[230px] focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="all">All Syllabus Units</option>
              {availableUnits.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Batch Actions Row */}
        {activeFlaggedInFilter.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-200/70 dark:border-slate-800">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              <span className="font-mono font-semibold text-slate-800 dark:text-slate-200 tabular-nums">
                {activeFlaggedInFilter.length}
              </span>{' '}
              flagged {activeFlaggedInFilter.length === 1 ? 'question' : 'questions'} ready for targeted redo
            </p>

            <div className="flex flex-wrap items-center gap-2">
              {feedbackBanner && (
                <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 mr-1">
                  {feedbackBanner}
                </span>
              )}
              <button
                type="button"
                onClick={handleBatchSendToTasks}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 hover:bg-slate-50 dark:hover:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Send Filtered Batch to Tasks</span>
              </button>
              <button
                type="button"
                onClick={handleBatchStartTimer}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white cursor-pointer"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Start Redo Session</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Queue List */}
      {filteredEntries.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 py-14 px-6 text-center">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
            {statusFilter === 'cleared'
              ? 'No questions cleared on redo yet'
              : 'Your Redo Queue is clear'}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {statusFilter === 'cleared'
              ? 'Questions marked as Redone & Mastered will appear here.'
              : 'Mark any past paper question as Must Redo or Silly Mistake to aggregate it here.'}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-slate-200/80 dark:divide-slate-800 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          {filteredEntries.map((entry) => {
            const subjDisplay = resolveALSubjectDisplay(entry.subject, subjects);
            const isCleared = entry.status === 'mastered' && !!entry.redoneAt;
            const statusMeta = QUESTION_STATUS_META[entry.status];

            return (
              <div
                key={entry.key}
                className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 px-4 py-3.5 hover:bg-slate-50/70 dark:hover:bg-slate-800/35 transition-colors"
              >
                <div className="space-y-1 min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                    <span
                      className="w-2.5 h-2.5 rounded-xs shrink-0"
                      style={{ backgroundColor: subjDisplay.color }}
                    />
                    <span className="font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                      {entry.displayCode}
                    </span>
                    <span aria-hidden="true" className="text-slate-400">
                      ·
                    </span>
                    <button
                      type="button"
                      onClick={() => onOpenPaper(entry.paperId)}
                      className="inline-flex items-center gap-1 font-medium text-slate-700 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer truncate max-w-[260px]"
                    >
                      <span className="truncate">{entry.paperTitle}</span>
                      <ExternalLink className="w-3 h-3 shrink-0 opacity-60" />
                    </button>
                    <span aria-hidden="true" className="text-slate-400">
                      ·
                    </span>
                    <span className="text-slate-500 dark:text-slate-400">
                      {subjDisplay.label}
                    </span>
                    <span aria-hidden="true" className="text-slate-400">
                      ·
                    </span>
                    {isCleared ? (
                      <span className="inline-flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
                        <Check className="w-3 h-3" />
                        Cleared on Redo
                      </span>
                    ) : (
                      <span className={`font-semibold ${statusMeta.textClass}`}>
                        {statusMeta.label}
                      </span>
                    )}
                    {entry.syllabusUnit && (
                      <>
                        <span aria-hidden="true" className="text-slate-400">
                          ·
                        </span>
                        <span className="font-medium text-slate-700 dark:text-slate-300">
                          {entry.syllabusUnit}
                        </span>
                      </>
                    )}
                  </div>

                  {entry.mistakeNote && (
                    <p className="text-xs text-slate-600 dark:text-slate-300 pl-4.5 break-words">
                      {entry.mistakeNote}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {!isCleared && (
                    <button
                      type="button"
                      onClick={() => {
                        setRecentlyClearedKeys((prev) => ({
                          ...prev,
                          [entry.key]: true,
                        }));
                        onMarkRedoneMastered(
                          entry.paperId,
                          entry.questionId,
                          entry.subPartId
                        );
                        showToast(`${entry.displayCode} marked Cleared on Redo`);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white transition-colors whitespace-nowrap cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Mark Redone &amp; Mastered</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      onSendQuestionToTasks({
                        subject: entry.subject,
                        paperTitle: entry.paperTitle,
                        questionCode: entry.displayCode,
                        syllabusUnit: entry.syllabusUnit,
                        mistakeNote: entry.mistakeNote,
                      });
                      showToast(`Sent ${entry.displayCode} to Study Tasks`);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 hover:bg-slate-50 dark:hover:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 whitespace-nowrap cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Send to Tasks</span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      onStartRedoTimer({
                        subject: entry.subject,
                        title: `Redo ${entry.paperTitle} · ${entry.displayCode}${
                          entry.syllabusUnit ? ` (${entry.syllabusUnit})` : ''
                        }`,
                      })
                    }
                    className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/70 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/50 px-3 py-1.5 text-xs font-medium text-blue-700 dark:text-blue-300 whitespace-nowrap cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>Start Redo Session</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
