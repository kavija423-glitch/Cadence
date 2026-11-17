import React, { useMemo, useState } from 'react';
import {
  FileText,
  Plus,
  Search,
  ListChecks,
  RotateCw,
  ChevronRight,
} from 'lucide-react';
import type {
  ALSubjectKey,
  PaperMedium,
  PastPaperRecord,
  Subject,
} from '../types';
import {
  AL_SUBJECT_LIST,
  computePaperStats,
  extractRedoQueueEntries,
  resolveALSubjectDisplay,
  type RedoQueueEntry,
} from '../utils/pastPapers';
import { AddPaperModal } from './AddPaperModal';
import { PaperDetailView } from './PaperDetailView';
import { RedoQueueView } from './RedoQueueView';

type PapersSubView = 'all' | 'redo_queue';

interface PapersViewProps {
  subjects: Subject[];
  pastPapers: PastPaperRecord[];
  onCreatePaper: (paper: PastPaperRecord) => void;
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
  onSendBatchToTasks: (entries: RedoQueueEntry[]) => void;
  onStartRedoTimer: (params: {
    subject: ALSubjectKey;
    title: string;
  }) => void;
}

export const PapersView: React.FC<PapersViewProps> = ({
  subjects,
  pastPapers,
  onCreatePaper,
  onUpdatePaper,
  onDeletePaper,
  onSendQuestionToTasks,
  onSendBatchToTasks,
  onStartRedoTimer,
}) => {
  const [subView, setSubView] = useState<PapersSubView>('all');
  const [selectedPaperId, setSelectedPaperId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [subjectFilter, setSubjectFilter] = useState<'all' | ALSubjectKey>('all');
  const [mediumFilter, setMediumFilter] = useState<'all' | PaperMedium>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const visiblePapers = useMemo(
    () =>
      pastPapers
        .filter((p) => !p.deleted)
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        ),
    [pastPapers]
  );

  const selectedPaper = useMemo(
    () =>
      selectedPaperId
        ? visiblePapers.find((p) => p.id === selectedPaperId) || null
        : null,
    [visiblePapers, selectedPaperId]
  );

  const activeRedoCount = useMemo(() => {
    const entries = extractRedoQueueEntries(visiblePapers);
    return entries.filter((e) => e.status === 'redo' || e.status === 'silly').length;
  }, [visiblePapers]);

  const filteredPapers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return visiblePapers.filter((p) => {
      if (subjectFilter !== 'all' && p.subject !== subjectFilter) return false;
      if (mediumFilter !== 'all' && p.medium !== mediumFilter) return false;
      if (q && !p.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [visiblePapers, subjectFilter, mediumFilter, searchQuery]);

  const handleMarkRedoneMastered = (
    paperId: string,
    questionId: string,
    subPartId?: string
  ) => {
    const now = new Date().toISOString();
    onUpdatePaper(paperId, (prev) => ({
      ...prev,
      updatedAt: now,
      questions: prev.questions.map((q) => {
        if (q.id !== questionId) return q;
        if (subPartId && q.subParts) {
          return {
            ...q,
            updatedAt: now,
            subParts: q.subParts.map((sp) =>
              sp.id === subPartId
                ? { ...sp, status: 'mastered', redoneAt: now, updatedAt: now }
                : sp
            ),
          };
        }
        return {
          ...q,
          status: 'mastered',
          redoneAt: now,
          updatedAt: now,
        };
      }),
    }));
  };

  if (selectedPaper) {
    return (
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-6">
        <PaperDetailView
          paper={selectedPaper}
          subjects={subjects}
          onBack={() => setSelectedPaperId(null)}
          onUpdatePaper={onUpdatePaper}
          onDeletePaper={(id) => {
            onDeletePaper(id);
            setSelectedPaperId(null);
          }}
          onSendQuestionToTasks={onSendQuestionToTasks}
          onStartRedoTimer={onStartRedoTimer}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-6 space-y-6">
      {/* Header + Sub-view Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            Past Papers
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            G.C.E. A/L Physics, Combined Maths &amp; ICT · Exception-based mistake logging &amp; redo queue
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Sub-view Toggle: All Papers | Redo Queue */}
          <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setSubView('all')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                subView === 'all'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <ListChecks className="w-3.5 h-3.5" />
              <span>All Papers</span>
              <span className="font-mono tabular-nums text-[11px] opacity-70">
                {visiblePapers.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setSubView('redo_queue')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                subView === 'redo_queue'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span>Redo Queue</span>
              <span
                className={`font-mono tabular-nums text-[11px] ${
                  activeRedoCount > 0
                    ? 'text-rose-600 dark:text-rose-400 font-semibold'
                    : 'opacity-70'
                }`}
              >
                {activeRedoCount}
              </span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 px-3.5 py-2 text-xs font-semibold text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Paper</span>
          </button>
        </div>
      </div>

      {subView === 'redo_queue' ? (
        <RedoQueueView
          papers={visiblePapers}
          subjects={subjects}
          onOpenPaper={(paperId) => setSelectedPaperId(paperId)}
          onMarkRedoneMastered={handleMarkRedoneMastered}
          onSendQuestionToTasks={onSendQuestionToTasks}
          onSendBatchToTasks={onSendBatchToTasks}
          onStartRedoTimer={onStartRedoTimer}
        />
      ) : (
        <>
          {/* Filter Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
            <div className="flex items-center gap-1 overflow-x-auto p-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setSubjectFilter('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  subjectFilter === 'all'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                All Subjects
              </button>
              {AL_SUBJECT_LIST.map((cfg) => {
                const display = resolveALSubjectDisplay(cfg.key, subjects);
                const active = subjectFilter === cfg.key;
                return (
                  <button
                    key={cfg.key}
                    type="button"
                    onClick={() => setSubjectFilter(cfg.key)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      active
                        ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    <span
                      className="w-2 h-2 rounded-xs shrink-0"
                      style={{ backgroundColor: display.color }}
                    />
                    <span>{cfg.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2">
              <div className="relative flex-1 sm:w-52">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search year or title..."
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 pl-8 pr-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <select
                value={mediumFilter}
                onChange={(e) =>
                  setMediumFilter(e.target.value as 'all' | PaperMedium)
                }
                aria-label="Filter by medium"
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="all">All Media</option>
                <option value="english">English</option>
                <option value="sinhala">Sinhala</option>
              </select>
            </div>
          </div>

          {/* Paper Cards Grid */}
          {filteredPapers.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 py-14 px-6 text-center space-y-3">
              <FileText className="w-8 h-8 text-slate-400 mx-auto" />
              <div>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  {visiblePapers.length === 0
                    ? 'No past papers logged yet'
                    : 'No papers match your filters'}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
                  {visiblePapers.length === 0
                    ? 'Add an Official A/L Past Paper (2010–2026) or Term/School paper to auto-generate the question grid and track mistakes.'
                    : 'Try clearing the search box or switching subject/medium filters.'}
                </p>
              </div>
              {visiblePapers.length === 0 && (
                <button
                  type="button"
                  onClick={() => setShowAddModal(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 px-4 py-2 text-xs font-semibold text-white cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add First Paper</span>
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredPapers.map((paper) => {
                const display = resolveALSubjectDisplay(paper.subject, subjects);
                const stats = computePaperStats(paper);
                const gradable = Math.max(1, stats.totalSlots - stats.unattempted);
                const masteredBarPct = (stats.mastered / gradable) * 100;
                const redoBarPct = (stats.redo / gradable) * 100;
                const sillyBarPct = (stats.silly / gradable) * 100;

                return (
                  <button
                    key={paper.id}
                    type="button"
                    onClick={() => setSelectedPaperId(paper.id)}
                    className="group text-left rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4 hover:border-slate-300 dark:hover:border-slate-700 transition-colors cursor-pointer"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                          <span
                            className="w-2.5 h-2.5 rounded-xs shrink-0"
                            style={{ backgroundColor: display.color }}
                          />
                          <span className="font-medium text-slate-700 dark:text-slate-300">
                            {display.label}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>
                            {paper.medium === 'sinhala' ? 'Sinhala' : 'English'}
                          </span>
                          {paper.marksAwarded !== undefined && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono tabular-nums text-slate-700 dark:text-slate-300 font-medium">
                                {paper.marksAwarded}
                                {paper.maxMarks ? `/${paper.maxMarks}` : ''}
                              </span>
                            </>
                          )}
                        </div>
                        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {paper.title}
                        </h3>
                      </div>

                      <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-200 shrink-0 mt-1 transition-colors" />
                    </div>

                    {/* Multi-segment Progress Bar */}
                    <div className="space-y-2">
                      <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden flex">
                        {masteredBarPct > 0 && (
                          <div
                            className="h-full bg-emerald-500"
                            style={{ width: `${masteredBarPct}%` }}
                          />
                        )}
                        {redoBarPct > 0 && (
                          <div
                            className="h-full bg-rose-500"
                            style={{ width: `${redoBarPct}%` }}
                          />
                        )}
                        {sillyBarPct > 0 && (
                          <div
                            className="h-full bg-amber-500"
                            style={{ width: `${sillyBarPct}%` }}
                          />
                        )}
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono tabular-nums">
                        <span className="text-slate-700 dark:text-slate-300 font-medium">
                          {stats.masteryPct}% mastered
                        </span>
                        <div className="flex items-center gap-2.5 text-[11px]">
                          <span className="text-emerald-600 dark:text-emerald-400">
                            {stats.mastered} ok
                          </span>
                          <span className="text-rose-600 dark:text-rose-400">
                            {stats.redo} redo
                          </span>
                          <span className="text-amber-600 dark:text-amber-400">
                            {stats.silly} silly
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}

      <AddPaperModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        subjects={subjects}
        defaultSubject={subjectFilter !== 'all' ? subjectFilter : 'physics'}
        onCreatePaper={(newPaper) => {
          onCreatePaper(newPaper);
          setSubView('all');
          setSelectedPaperId(newPaper.id);
        }}
      />
    </div>
  );
};
