import type { RepeatRule } from '../types';
import { addDays, parseLocalDateKey, toLocalDateKey } from './dateUtils';

export const WEEKDAY_NAMES_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

const DAY_TOKEN_MAP: Record<string, number> = {
  sun: 0,
  sunday: 0,
  mon: 1,
  monday: 1,
  tue: 2,
  tues: 2,
  tuesday: 2,
  wed: 3,
  wednesday: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6,
};

const REPEAT_LINE_REGEX = /^🔁\s*Repeat:\s*(.+)$/im;

export function normalizeRepeatRule(rule?: RepeatRule): RepeatRule | undefined {
  if (!rule || rule.type === 'none') return undefined;
  if (rule.type === 'custom') {
    const uniqueSorted = Array.from(new Set(rule.daysOfWeek || []))
      .filter((d) => d >= 0 && d <= 6)
      .sort((a, b) => a - b);
    if (uniqueSorted.length === 0) {
      return { type: 'daily' };
    }
    // Order Mon..Sun for nicer display, keeping canonical 0..6 numeric values
    return { type: 'custom', daysOfWeek: uniqueSorted };
  }
  return { type: rule.type };
}

export function formatRepeatLabel(rule?: RepeatRule): string {
  const norm = normalizeRepeatRule(rule);
  if (!norm) return '';
  switch (norm.type) {
    case 'daily':
      return 'Daily';
    case 'weekdays':
      return 'Weekdays (Mon-Fri)';
    case 'weekly':
      return 'Weekly';
    case 'monthly':
      return 'Monthly';
    case 'custom': {
      // Display Mon..Sun order
      const monFirstOrder = [1, 2, 3, 4, 5, 6, 0];
      const days = (norm.daysOfWeek || [])
        .slice()
        .sort((a, b) => monFirstOrder.indexOf(a) - monFirstOrder.indexOf(b));
      return `Every ${days.map((d) => WEEKDAY_NAMES_SHORT[d]).join(', ')}`;
    }
    default:
      return '';
  }
}

export function parseDaysList(rawList: string): number[] {
  const tokens = rawList
    .split(/[\s,/&]+/)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);

  const result: number[] = [];
  for (const tok of tokens) {
    if (tok in DAY_TOKEN_MAP) {
      result.push(DAY_TOKEN_MAP[tok]);
    }
  }
  return Array.from(new Set(result)).sort((a, b) => a - b);
}

export function extractRepeatFromText(rawText: string): {
  cleanedText: string;
  repeat?: RepeatRule;
} {
  let text = rawText;

  // 1. "every mon, wed, fri" / "every tuesday,thursday"
  const customMatch = text.match(
    /(?:^|\s)every\s+((?:(?:sun|sunday|mon|monday|tue|tues|tuesday|wed|wednesday|thu|thur|thurs|thursday|fri|friday|sat|saturday)(?:\s*,\s*|\s+and\s+|\s*&\s*|\s+))*(?:sun|sunday|mon|monday|tue|tues|tuesday|wed|wednesday|thu|thur|thurs|thursday|fri|friday|sat|saturday))(?=\s|$)/i
  );
  if (customMatch) {
    const days = parseDaysList(customMatch[1].replace(/\band\b/gi, ','));
    if (days.length > 0) {
      text = text.replace(customMatch[0], ' ').replace(/\s+/g, ' ').trim();
      return {
        cleanedText: text,
        repeat: { type: 'custom', daysOfWeek: days },
      };
    }
  }

  // 2. "every weekday" / "weekdays"
  const weekdaysMatch = text.match(/(?:^|\s)(?:every\s+weekdays?|weekdays?)(?=\s|$)/i);
  if (weekdaysMatch) {
    text = text.replace(weekdaysMatch[0], ' ').replace(/\s+/g, ' ').trim();
    return { cleanedText: text, repeat: { type: 'weekdays' } };
  }

  // 3. "every day" / "daily"
  const dailyMatch = text.match(/(?:^|\s)(?:every\s+day|daily)(?=\s|$)/i);
  if (dailyMatch) {
    text = text.replace(dailyMatch[0], ' ').replace(/\s+/g, ' ').trim();
    return { cleanedText: text, repeat: { type: 'daily' } };
  }

  // 4. "every week" / "weekly"
  const weeklyMatch = text.match(/(?:^|\s)(?:every\s+week|weekly)(?=\s|$)/i);
  if (weeklyMatch) {
    text = text.replace(weeklyMatch[0], ' ').replace(/\s+/g, ' ').trim();
    return { cleanedText: text, repeat: { type: 'weekly' } };
  }

  // 5. "every month" / "monthly"
  const monthlyMatch = text.match(/(?:^|\s)(?:every\s+month|monthly)(?=\s|$)/i);
  if (monthlyMatch) {
    text = text.replace(monthlyMatch[0], ' ').replace(/\s+/g, ' ').trim();
    return { cleanedText: text, repeat: { type: 'monthly' } };
  }

  return { cleanedText: text };
}

export function computeNextDueDate(
  currentDueKey: string | undefined,
  rule: RepeatRule | undefined,
  today: Date = new Date()
): string | undefined {
  const norm = normalizeRepeatRule(rule);
  if (!norm) return currentDueKey;

  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const dueDate = currentDueKey ? parseLocalDateKey(currentDueKey) : todayMidnight;
  const anchor = dueDate.getTime() >= todayMidnight.getTime() ? dueDate : todayMidnight;

  if (norm.type === 'daily') {
    return toLocalDateKey(addDays(anchor, 1));
  }

  if (norm.type === 'weekdays') {
    let cursor = addDays(anchor, 1);
    while (cursor.getDay() === 0 || cursor.getDay() === 6) {
      cursor = addDays(cursor, 1);
    }
    return toLocalDateKey(cursor);
  }

  if (norm.type === 'weekly') {
    return toLocalDateKey(addDays(anchor, 7));
  }

  if (norm.type === 'monthly') {
    const targetMonth = anchor.getMonth() + 1;
    const targetYear = anchor.getFullYear() + Math.floor(targetMonth / 12);
    const normalizedMonth = targetMonth % 12;
    const maxDay = new Date(targetYear, normalizedMonth + 1, 0).getDate();
    const clampedDay = Math.min(anchor.getDate(), maxDay);
    return toLocalDateKey(new Date(targetYear, normalizedMonth, clampedDay));
  }

  if (norm.type === 'custom') {
    const allowed = norm.daysOfWeek || [];
    if (allowed.length === 0) return toLocalDateKey(addDays(anchor, 1));
    let cursor = addDays(anchor, 1);
    for (let i = 0; i < 7; i++) {
      if (allowed.includes(cursor.getDay())) {
        return toLocalDateKey(cursor);
      }
      cursor = addDays(cursor, 1);
    }
    return toLocalDateKey(addDays(anchor, 1));
  }

  return currentDueKey;
}

export function syncRepeatMetadataInNotes(
  notes: string | undefined,
  rule?: RepeatRule
): string {
  const baseLines = (notes || '')
    .split(/\r?\n/)
    .filter((line) => !REPEAT_LINE_REGEX.test(line.trim()))
    .join('\n')
    .trim();

  const label = formatRepeatLabel(rule);
  if (!label) {
    return baseLines;
  }

  const metaLine = `🔁 Repeat: ${label}`;
  return baseLines ? `${baseLines}\n${metaLine}` : metaLine;
}

export function parseRepeatFromNotes(notes: string | undefined): {
  cleanNotes?: string;
  repeat?: RepeatRule;
} {
  if (!notes) return { cleanNotes: undefined, repeat: undefined };

  const lines = notes.split(/\r?\n/);
  let parsedRepeat: RepeatRule | undefined;
  const remaining: string[] = [];

  for (const line of lines) {
    const m = line.trim().match(REPEAT_LINE_REGEX);
    if (m) {
      const val = m[1].trim().toLowerCase();
      if (val === 'daily') {
        parsedRepeat = { type: 'daily' };
      } else if (val.startsWith('weekdays')) {
        parsedRepeat = { type: 'weekdays' };
      } else if (val === 'weekly') {
        parsedRepeat = { type: 'weekly' };
      } else if (val === 'monthly') {
        parsedRepeat = { type: 'monthly' };
      } else if (val.startsWith('every ')) {
        const days = parseDaysList(val.replace(/^every\s+/, ''));
        if (days.length > 0) {
          parsedRepeat = { type: 'custom', daysOfWeek: days };
        }
      }
    } else {
      remaining.push(line);
    }
  }

  const joined = remaining.join('\n').trim();
  return {
    cleanNotes: joined || undefined,
    repeat: parsedRepeat,
  };
}
