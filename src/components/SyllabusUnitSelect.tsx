import React, { useState } from 'react';
import type { ALSubjectKey } from '../types';
import { SYLLABUS_UNITS } from '../utils/pastPapers';

interface SyllabusUnitSelectProps {
  subject: ALSubjectKey;
  value?: string;
  onChange: (unit: string | undefined) => void;
  id?: string;
}

export const SyllabusUnitSelect: React.FC<SyllabusUnitSelectProps> = ({
  subject,
  value,
  onChange,
  id,
}) => {
  const presets = SYLLABUS_UNITS[subject];
  const isPreset = !value || presets.includes(value);
  const [customMode, setCustomMode] = useState(!isPreset);
  const [draftCustom, setDraftCustom] = useState(!isPreset && value ? value : '');

  const handleSelectChange = (next: string) => {
    if (next === '__custom__') {
      setCustomMode(true);
      setDraftCustom(value && !presets.includes(value) ? value : '');
      return;
    }
    setCustomMode(false);
    onChange(next || undefined);
  };

  if (customMode) {
    return (
      <div className="flex items-center gap-1.5">
        <input
          id={id}
          type="text"
          value={draftCustom}
          onChange={(e) => {
            const v = e.target.value;
            setDraftCustom(v);
            onChange(v.trim() ? v : undefined);
          }}
          placeholder="Custom syllabus unit..."
          className="flex-1 min-w-0 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
        />
        <button
          type="button"
          onClick={() => {
            setCustomMode(false);
            if (draftCustom.trim() && presets.includes(draftCustom.trim())) {
              onChange(draftCustom.trim());
            } else if (!draftCustom.trim()) {
              onChange(undefined);
            }
          }}
          className="rounded-lg border border-slate-200 dark:border-slate-700 px-2 py-1.5 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
        >
          Presets
        </button>
      </div>
    );
  }

  return (
    <select
      id={id}
      value={value && presets.includes(value) ? value : value ? '__custom_existing__' : ''}
      onChange={(e) => handleSelectChange(e.target.value)}
      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
    >
      <option value="">Select syllabus unit...</option>
      {presets.map((unit) => (
        <option key={unit} value={unit}>
          {unit}
        </option>
      ))}
      {value && !presets.includes(value) && (
        <option value="__custom_existing__">{value}</option>
      )}
      <option value="__custom__">+ Custom unit tag...</option>
    </select>
  );
};
