import type { Priority, Subject } from '../types';
import { addDays, toLocalDateKey } from './dateUtils';

export interface ParsedQuickTask {
  title: string;
  subjectId: string;
  subjectName: string;
  estimatedMinutes: number;
  priority: Priority;
  due?: string;
}

export function parseQuickAddTask(
  rawInput: string,
  subjects: Subject[],
  fallbackSubjectId: string
): ParsedQuickTask {
  let text = rawInput.trim();

  // 1. Parse priority: !high, !med, !medium, !low
  let priority: Priority = 'medium';
  const prioMatch = text.match(/(?:^|\s)!(high|med|medium|low)(?=\s|$)/i);
  if (prioMatch) {
    const p = prioMatch[1].toLowerCase();
    priority = p === 'high' ? 'high' : p === 'low' ? 'low' : 'medium';
    text = text.replace(prioMatch[0], ' ').trim();
  }

  // 2. Parse duration: 60m, 45min, 1.5h, 2h
  let estimatedMinutes = 45;
  const durMatch = text.match(/(?:^|\s)(\d+(?:\.\d+)?)\s*(h|hr|hrs|m|min|mins)(?=\s|$)/i);
  if (durMatch) {
    const val = parseFloat(durMatch[1]);
    const unit = durMatch[2].toLowerCase();
    const rawMins = unit.startsWith('h') ? Math.round(val * 60) : Math.round(val);
    estimatedMinutes = Math.max(15, Math.min(480, Math.round(rawMins / 15) * 15));
    text = text.replace(durMatch[0], ' ').trim();
  }

  // 3. Parse due token: @today, @tomorrow, @YYYY-MM-DD or bare YYYY-MM-DD
  let due: string | undefined;
  const dueTokenMatch = text.match(/(?:^|\s)@(today|tomorrow|\d{4}-\d{2}-\d{2})(?=\s|$)/i);
  if (dueTokenMatch) {
    const tok = dueTokenMatch[1].toLowerCase();
    if (tok === 'today') {
      due = toLocalDateKey(new Date());
    } else if (tok === 'tomorrow') {
      due = toLocalDateKey(addDays(new Date(), 1));
    } else {
      due = tok;
    }
    text = text.replace(dueTokenMatch[0], ' ').trim();
  } else {
    const isoMatch = text.match(/(?:^|\s)(\d{4}-\d{2}-\d{2})(?=\s|$)/);
    if (isoMatch) {
      due = isoMatch[1];
      text = text.replace(isoMatch[0], ' ').trim();
    }
  }

  // 4. Parse subject tag: #Physics or #Organic-Chemistry
  let subjectId = fallbackSubjectId || subjects[0]?.id || 'subj-general';
  let subjectName = subjects.find((s) => s.id === subjectId)?.name || 'General';
  const subjMatch = text.match(/(?:^|\s)#([a-zA-Z0-9_-]+)/);
  if (subjMatch) {
    const needle = subjMatch[1].replace(/[-_]/g, ' ').toLowerCase();
    const matched = subjects.find(
      (s) =>
        s.name.toLowerCase() === needle ||
        s.name.toLowerCase().replace(/\s+/g, '') === needle.replace(/\s+/g, '') ||
        s.name.toLowerCase().startsWith(needle)
    );
    if (matched) {
      subjectId = matched.id;
      subjectName = matched.name;
    }
    text = text.replace(subjMatch[0], ' ').trim();
  }

  const cleanTitle = text.replace(/\s+/g, ' ').trim();

  return {
    title: cleanTitle,
    subjectId,
    subjectName,
    estimatedMinutes,
    priority,
    due,
  };
}
