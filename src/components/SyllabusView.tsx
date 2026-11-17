import React, { useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Plus,
  StickyNote,
  Send,
  Play,
  Clock,
  Trash2,
  Search,
  Check,
  ChevronsUpDown,
} from 'lucide-react';
import type {
  ALSubjectKey,
  Subject,
  SyllabusMasteryStatus,
  SyllabusSubtopicProgress,
} from '../types';
import { AL_SUBJECT_LIST, resolveALSubjectDisplay } from '../utils/pastPapers';
import {
  SYLLABUS_STATUS_META,
  SYLLABUS_STATUS_ORDER,
  SYLLABUS_SUBJECT_SINHALA,
  SYLLABUS_UNITS_TREE,
  computeSubjectSyllabusSummary,
  computeSubtopicsSummary,
  formatLastRevisedShort,
  getMergedUnitSubtopics,
  isDueForReview,
  type ResolvedSubtopicItem,
  type SyllabusUnitSeed,
} from '../utils/syllabusData';

type SyllabusStatusFilter = 'all' | 'needs_revision' | 'not_started';

interface SyllabusViewProps {
  subjects: Subject[];
  syllabusProgress: Record<string, SyllabusSubtopicProgress>;
  onUpdateSubtopic: (
    subtopic: ResolvedSubtopicItem,
    patch: Partial<SyllabusSubtopicProgress>
  ) => void;
  onAddCustomSubtopic: (
    unit: SyllabusUnitSeed,
    title: string
  ) => void;
  onDeleteCustomSubtopic: (subtopicId: string) => void;
  onAddRevisionTask: (params: {
    subject: ALSubjectKey;
    subtopicTitle: string;
    unitTitle: string;
    note?: string;
    isUrgent?: boolean;
  }) => void;
  onStartRevisionTimer: (params: {
    subject: ALSubjectKey;
    title: string;
  }) => void;
}

export const SyllabusView: React.FC<SyllabusViewProps> = ({
  subjects,
  syllabusProgress,
  onUpdateSubtopic,
  onAddCustomSubtopic,
  onDeleteCustomSubtopic,
  onAddRevisionTask,
  onStartRevisionTimer,
}) => {
  const [subjectFilter, setSubjectFilter] = useState<'all' | ALSubjectKey>('all');
  const [statusFilter, setStatusFilter] = useState<SyllabusStatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedUnits, setExpandedUnits] = useState<Record<string, boolean>>({
    'phy-u1': true,
  });
  const [openNotes, setOpenNotes] = useState<Record<string, boolean>>({});
  const [addingCustomUnitId, setAddingCustomUnitId] = useState<string | null>(null);
  const [customSubtopicTitle, setCustomSubtopicTitle] = useState('');
  const [addedTaskFeedbackId, setAddedTaskFeedbackId] = useState<string | null>(null);

  const subjectSummaries = useMemo(() => {
    return AL_SUBJECT_LIST.map((cfg) => ({
      cfg,
      display: resolveALSubjectDisplay(cfg.key, subjects),
      sinhalaName: SYLLABUS_SUBJECT_SINHALA[cfg.key],
      summary: computeSubjectSyllabusSummary(cfg.key, syllabusProgress),
    }));
  }, [subjects, syllabusProgress]);

  const visibleUnits = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return SYLLABUS_UNITS_TREE.filter((unit) => {
      if (subjectFilter !== 'all' && unit.subject !== subjectFilter) return false;
      const merged = getMergedUnitSubtopics(unit, syllabusProgress);
      const filteredSubs = merged.filter((st) => {
        if (statusFilter === 'needs_revision' && st.status !== 'needs_revision') {
          return false;
        }
        if (statusFilter === 'not_started' && st.status !== 'not_started') {
          return false;
        }
        if (q) {
          const matchesUnit = unit.title.toLowerCase().includes(q);
          const matchesSub = st.title.toLowerCase().includes(q);
          const matchesNote = (st.note || '').toLowerCase().includes(q);
          return matchesUnit || matchesSub || matchesNote;
        }
        return true;
      });
      return filteredSubs.length > 0;
    });
  }, [subjectFilter, statusFilter, searchQuery, syllabusProgress]);

  const toggleUnit = (unitId: string) => {
    setExpandedUnits((prev) => ({ ...prev, [unitId]: !prev[unitId] }));
  };

  const anyVisibleExpanded = visibleUnits.some((u) => !!expandedUnits[u.id]);

  const handleToggleExpandAll = () => {
    if (anyVisibleExpanded) {
      setExpandedUnits({});
    } else {
      const next: Record<string, boolean> = {};
      for (const u of visibleUnits) next[u.id] = true;
      setExpandedUnits(next);
    }
  };

  const handleIncrementRevision = (item: ResolvedSubtopicItem) => {
    const nowIso = new Date().toISOString();
    onUpdateSubtopic(item, {
      revisionCount: item.revisionCount + 1,
      lastRevisedAt: nowIso,
      status: item.status === 'not_started' ? 'learning' : item.status,
    });
  };

  const handleTriggerAddTask = (
    item: ResolvedSubtopicItem,
    unitTitle: string
  ) => {
    onAddRevisionTask({
      subject: item.subject,
      subtopicTitle: item.title,
      unitTitle,
      note: item.note,
      isUrgent: item.status === 'needs_revision' || isDueForReview(item.lastRevisedAt),
    });
    setAddedTaskFeedbackId(item.id);
    window.setTimeout(() => {
      setAddedTaskFeedbackId((cur) => (cur === item.id ? null : cur));
    }, 1800);
  };

  const handleCustomSubmit = (e: React.FormEvent, unit: SyllabusUnitSeed) => {
    e.preventDefault();
    const trimmed = customSubtopicTitle.trim();
    if (!trimmed) return;
    onAddCustomSubtopic(unit, trimmed);
    setCustomSubtopicTitle('');
    setAddingCustomUnitId(null);
  };

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-6 space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            A/L Syllabus Tracker
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            G.C.E. A/L Physics, Combined Mathematics &amp; ICT · Mastery levels, confidence &amp; 14-day spaced revision
          </p>
        </div>

        <button
          type="button"
          onClick={handleToggleExpandAll}
          className="inline-flex items-center self-start sm:self-auto gap-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <ChevronsUpDown className="w-3.5 h-3.5" />
          <span>{anyVisibleExpanded ? 'Collapse All Units' : 'Expand All Units'}</span>
        </button>
      </div>

      {/* Overview Dashboard Header: 3 Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {subjectSummaries.map(({ cfg, display, sinhalaName, summary }) => {
          const isSelected = subjectFilter === cfg.key;
          return (
            <button
              key={cfg.key}
              type="button"
              onClick={() =>
                setSubjectFilter((cur) => (cur === cfg.key ? 'all' : cfg.key))
              }
              className={`text-left rounded-2xl border p-5 space-y-4 transition-colors cursor-pointer ${
                isSelected
                  ? 'border-blue-500 dark:border-blue-500 bg-white dark:bg-slate-900 ring-1 ring-blue-500/30'
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-xs shrink-0"
                      style={{ backgroundColor: display.color }}
                    />
                    <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {display.label}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                    {sinhalaName}
                  </p>
                </div>

                <div className="text-right shrink-0">
                  <div className="text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100 leading-none">
                    {summary.masteryPct}%
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 font-mono tabular-nums">
                    {summary.totalRevisions} rev sessions
                  </div>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${summary.masteryPct}%`,
                    backgroundColor: display.color,
                  }}
                />
              </div>

              {/* 4-State Breakdown Counts (Zero-pill clean tabular layout) */}
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs font-mono tabular-nums">
                <div className="flex items-center justify-between text-emerald-700 dark:text-emerald-400">
                  <span className="font-sans">Mastered</span>
                  <span className="font-semibold">{summary.mastered}</span>
                </div>
                <div className="flex items-center justify-between text-amber-700 dark:text-amber-400">
                  <span className="font-sans">Needs Rev</span>
                  <span className="font-semibold">{summary.needsRevision}</span>
                </div>
                <div className="flex items-center justify-between text-blue-600 dark:text-blue-400">
                  <span className="font-sans">Learning</span>
                  <span className="font-semibold">{summary.learning}</span>
                </div>
                <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                  <span className="font-sans">Not Started</span>
                  <span className="font-semibold">{summary.notStarted}</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Filters Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div className="flex flex-wrap items-center gap-2">
          {/* Subject Filter Pill Bar */}
          <div className="flex items-center gap-1 overflow-x-auto p-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800 max-w-full">
            <button
              type="button"
              onClick={() => setSubjectFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                subjectFilter === 'all'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              All
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
                  <span>{cfg.shortLabel}</span>
                </button>
              );
            })}
          </div>

          {/* Quick Status Filter */}
          <div className="flex items-center gap-1 overflow-x-auto p-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800 max-w-full">
            {(
              [
                { id: 'all', label: 'All Topics' },
                { id: 'needs_revision', label: 'Needs Revision Only' },
                { id: 'not_started', label: 'Not Started' },
              ] as Array<{ id: SyllabusStatusFilter; label: string }>
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setStatusFilter(f.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  statusFilter === f.id
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Search Input */}
        <div className="relative w-full lg:w-64">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search units or subtopics..."
            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 pl-8 pr-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>
      </div>

      {/* Expandable Two-Level Syllabus Accordion Tree */}
      {visibleUnits.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 py-14 px-6 text-center">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
            No syllabus topics match this filter
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Switch to All Topics or clear your search query to browse all units.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visibleUnits.map((unit) => {
            const display = resolveALSubjectDisplay(unit.subject, subjects);
            const allUnitSubs = getMergedUnitSubtopics(unit, syllabusProgress);
            const unitStats = computeSubtopicsSummary(allUnitSubs);
            const isExpanded = !!expandedUnits[unit.id] || !!searchQuery.trim();
            const hasDueItem = allUnitSubs.some((st) =>
              isDueForReview(st.lastRevisedAt)
            );

            const q = searchQuery.trim().toLowerCase();
            const displayedSubs = allUnitSubs.filter((st) => {
              if (
                statusFilter === 'needs_revision' &&
                st.status !== 'needs_revision'
              ) {
                return false;
              }
              if (statusFilter === 'not_started' && st.status !== 'not_started') {
                return false;
              }
              if (q) {
                return (
                  unit.title.toLowerCase().includes(q) ||
                  st.title.toLowerCase().includes(q) ||
                  (st.note || '').toLowerCase().includes(q)
                );
              }
              return true;
            });

            return (
              <div
                key={unit.id}
                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden"
              >
                {/* Accordion Unit Header */}
                <button
                  type="button"
                  aria-expanded={isExpanded}
                  onClick={() => toggleUnit(unit.id)}
                  className="w-full text-left px-4 sm:px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors cursor-pointer"
                >
                  <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-slate-400 shrink-0 mt-0.5 sm:mt-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-slate-400 shrink-0 mt-0.5 sm:mt-0" />
                    )}
                    <span
                      className="w-2.5 h-2.5 rounded-xs shrink-0 mt-1 sm:mt-0"
                      style={{ backgroundColor: display.color }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 break-words">
                          {unit.title}
                        </span>
                        {subjectFilter === 'all' && (
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            · {display.label}
                          </span>
                        )}
                        {hasDueItem && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                            · <Clock className="w-3 h-3" /> Due for Review
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-mono tabular-nums">
                        {unitStats.mastered}/{unitStats.total} mastered ·{' '}
                        {unitStats.totalRevisions} revisions
                      </div>
                    </div>
                  </div>

                  {/* Unit Completion % Bar */}
                  <div className="flex items-center gap-3 sm:w-52 shrink-0 pl-7 sm:pl-0">
                    <div className="flex-1 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${unitStats.masteryPct}%`,
                          backgroundColor: display.color,
                        }}
                      />
                    </div>
                    <span className="w-10 text-right text-xs font-mono font-semibold tabular-nums text-slate-700 dark:text-slate-300">
                      {unitStats.masteryPct}%
                    </span>
                  </div>
                </button>

                {/* Expanded Subtopics List */}
                {isExpanded && (
                  <div className="border-t border-slate-200/80 dark:border-slate-800 divide-y divide-slate-200/70 dark:divide-slate-800">
                    {displayedSubs.map((item) => {
                      const statusMeta = SYLLABUS_STATUS_META[item.status];
                      const dueReview = isDueForReview(item.lastRevisedAt);
                      const lastFormatted = formatLastRevisedShort(
                        item.lastRevisedAt
                      );
                      const noteExpanded =
                        !!openNotes[item.id] || !!(item.note && item.note.trim());
                      const taskWasAdded = addedTaskFeedbackId === item.id;

                      return (
                        <div
                          key={item.id}
                          className="px-4 sm:px-5 py-3.5 space-y-2.5 bg-slate-50/40 dark:bg-slate-950/25"
                        >
                          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
                            {/* Left: Subtopic Title + Review Age Indicator */}
                            <div className="min-w-0 flex-1 space-y-1">
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <span
                                  className="w-2 h-2 rounded-full shrink-0"
                                  style={{ backgroundColor: statusMeta.dotColor }}
                                />
                                <span className="text-sm font-medium text-slate-900 dark:text-slate-100 break-words">
                                  {item.title}
                                </span>
                                {item.isCustom && (
                                  <span className="text-[11px] text-slate-400 dark:text-slate-500">
                                    · Custom
                                  </span>
                                )}
                                {dueReview && (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 dark:text-amber-400">
                                    · <Clock className="w-3 h-3" /> Due for Review
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Right: Mastery Status, Confidence 5-Dot, Revision Counter, Note, Cadence Actions */}
                            <div className="flex flex-wrap items-center gap-2 sm:gap-3 shrink-0">
                              {/* 1. Mastery Status Dropdown */}
                              <select
                                value={item.status}
                                onChange={(e) =>
                                  onUpdateSubtopic(item, {
                                    status: e.target.value as SyllabusMasteryStatus,
                                  })
                                }
                                aria-label={`Mastery status for ${item.title}`}
                                className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-600 ${statusMeta.bgClass}`}
                              >
                                {SYLLABUS_STATUS_ORDER.map((stKey) => (
                                  <option
                                    key={stKey}
                                    value={stKey}
                                    className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                                  >
                                    {SYLLABUS_STATUS_META[stKey].sinhalaLabel}
                                  </option>
                                ))}
                              </select>

                              {/* 2. Confidence 5-Dot Rating */}
                              <div
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 py-1"
                                role="group"
                                aria-label={`Confidence rating for ${item.title}`}
                              >
                                <span className="text-[10px] text-slate-400 mr-0.5 hidden sm:inline">
                                  Conf
                                </span>
                                {([1, 2, 3, 4, 5] as const).map((lvl) => {
                                  const filled = item.confidence >= lvl;
                                  return (
                                    <button
                                      key={lvl}
                                      type="button"
                                      onClick={() =>
                                        onUpdateSubtopic(item, {
                                          confidence: lvl,
                                        })
                                      }
                                      className="p-0.5 rounded-full cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                                      title={`Confidence ${lvl} of 5`}
                                      aria-label={`Set confidence ${lvl} of 5`}
                                    >
                                      <span
                                        className={`block w-2.5 h-2.5 rounded-full transition-colors ${
                                          filled
                                            ? ''
                                            : 'bg-slate-200 dark:bg-slate-700'
                                        }`}
                                        style={
                                          filled
                                            ? { backgroundColor: display.color }
                                            : undefined
                                        }
                                      />
                                    </button>
                                  );
                                })}
                              </div>

                              {/* 3. Revision Counter + Last Revised */}
                              <div className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-1 text-xs">
                                <span className="font-mono tabular-nums text-slate-700 dark:text-slate-200 font-medium">
                                  Rev: {item.revisionCount}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleIncrementRevision(item)}
                                  className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-slate-100 dark:bg-slate-800 hover:bg-blue-600 hover:text-white text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
                                  title="Log completed revision (+1)"
                                  aria-label={`Increment revision count for ${item.title}`}
                                >
                                  <Plus className="w-3 h-3" />
                                </button>
                                {lastFormatted && (
                                  <span className="text-[11px] text-slate-400 dark:text-slate-500 font-mono tabular-nums whitespace-nowrap">
                                    Last: {lastFormatted}
                                  </span>
                                )}
                              </div>

                              {/* 4. Quick Note Toggle */}
                              <button
                                type="button"
                                onClick={() =>
                                  setOpenNotes((prev) => ({
                                    ...prev,
                                    [item.id]: !noteExpanded,
                                  }))
                                }
                                className={`inline-flex items-center justify-center h-8 w-8 rounded-lg border transition-colors cursor-pointer ${
                                  noteExpanded
                                    ? 'border-blue-300 dark:border-blue-800 bg-blue-50/70 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400'
                                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                                }`}
                                title="Toggle quick formula/weak-area note"
                                aria-label={`Toggle note for ${item.title}`}
                              >
                                <StickyNote className="w-3.5 h-3.5" />
                              </button>

                              {/* 5. Cadence Workflow Actions: Add Revision Task & Start Timer */}
                              <button
                                type="button"
                                onClick={() =>
                                  handleTriggerAddTask(item, unit.title)
                                }
                                className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                                  taskWasAdded
                                    ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200'
                                }`}
                                title="Push revision task (45m) to Cadence Tasks"
                              >
                                {taskWasAdded ? (
                                  <Check className="w-3.5 h-3.5" />
                                ) : (
                                  <Send className="w-3.5 h-3.5" />
                                )}
                                <span>
                                  {taskWasAdded ? 'Task Added' : 'Add Revision Task'}
                                </span>
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  onStartRevisionTimer({
                                    subject: item.subject,
                                    title: `Revise: ${item.title}`,
                                  })
                                }
                                className="inline-flex items-center gap-1 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/70 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/50 px-2.5 py-1.5 text-xs font-medium text-blue-700 dark:text-blue-300 transition-colors whitespace-nowrap cursor-pointer"
                                title="Load into bottom focus timer bar"
                              >
                                <Play className="w-3.5 h-3.5" />
                                <span>Start Timer</span>
                              </button>

                              {item.isCustom && (
                                <button
                                  type="button"
                                  onClick={() => onDeleteCustomSubtopic(item.id)}
                                  className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                                  title="Delete custom subtopic"
                                  aria-label={`Delete custom subtopic ${item.title}`}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Inline Quick Note Input */}
                          {noteExpanded && (
                            <div className="pl-4">
                              <input
                                type="text"
                                value={item.note || ''}
                                onChange={(e) =>
                                  onUpdateSubtopic(item, {
                                    note: e.target.value,
                                  })
                                }
                                placeholder="Quick note: key formulas, weak areas (සිංහල / English)..."
                                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Add Custom Subtopic Row */}
                    <div className="px-4 sm:px-5 py-3 bg-white dark:bg-slate-900">
                      {addingCustomUnitId === unit.id ? (
                        <form
                          onSubmit={(e) => handleCustomSubmit(e, unit)}
                          className="flex flex-wrap items-center gap-2"
                        >
                          <input
                            type="text"
                            autoFocus
                            value={customSubtopicTitle}
                            onChange={(e) =>
                              setCustomSubtopicTitle(e.target.value)
                            }
                            placeholder="Enter custom subtopic (සිංහල / English)..."
                            className="flex-1 min-w-[200px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
                          />
                          <button
                            type="submit"
                            className="rounded-lg bg-blue-600 hover:bg-blue-700 px-3 py-1.5 text-xs font-medium text-white cursor-pointer"
                          >
                            Add
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setAddingCustomUnitId(null);
                              setCustomSubtopicTitle('');
                            }}
                            className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 cursor-pointer"
                          >
                            Cancel
                          </button>
                        </form>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setAddingCustomUnitId(unit.id);
                            setCustomSubtopicTitle('');
                          }}
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Add Custom Subtopic</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
