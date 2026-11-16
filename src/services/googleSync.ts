import type {
  CalendarBlock,
  GoogleCalendarEventOverlay,
  StudyDatabase,
  Subject,
  TaskMetadata,
} from '../types';
import { toLocalDateKey } from '../utils/dateUtils';
import { SUBJECT_COLORS } from '../utils/seedData';

export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/drive.appdata',
  'https://www.googleapis.com/auth/tasks',
  'https://www.googleapis.com/auth/calendar.readonly',
];

const CLIENT_ID_STORAGE_KEY = 'cadence_google_client_id';
const OAUTH_STATE_STORAGE_KEY = 'cadence_oauth_state';
const SYNC_FILENAME = 'study_sync.json';

// Strict in-memory token cache (never stored in localStorage)
let cachedAccessToken: string | null = null;
let tokenExpiresAtMs = 0;

export function getSavedClientId(): string {
  try {
    return localStorage.getItem(CLIENT_ID_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

export function saveClientId(clientId: string): void {
  try {
    const trimmed = clientId.trim();
    if (trimmed) {
      localStorage.setItem(CLIENT_ID_STORAGE_KEY, trimmed);
    } else {
      localStorage.removeItem(CLIENT_ID_STORAGE_KEY);
    }
  } catch {
    // Ignore storage errors
  }
}

export function hasValidAccessToken(): boolean {
  return !!cachedAccessToken && Date.now() < tokenExpiresAtMs - 30_000;
}

export function getAccessToken(): string | null {
  return hasValidAccessToken() ? cachedAccessToken : null;
}

export function clearAccessToken(): void {
  const token = cachedAccessToken;
  cachedAccessToken = null;
  tokenExpiresAtMs = 0;
  if (token) {
    fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
      method: 'POST',
    }).catch(() => {
      // Ignore revoke network errors
    });
  }
}

export function redirectToGoogleOAuth(clientId: string): void {
  const trimmedId = clientId.trim();
  if (!trimmedId) {
    throw new Error('Please paste your Google OAuth Client ID first.');
  }

  const state =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);

  try {
    sessionStorage.setItem(OAUTH_STATE_STORAGE_KEY, state);
  } catch {
    // Ignore sessionStorage restrictions
  }

  const params = new URLSearchParams({
    client_id: trimmedId,
    redirect_uri: window.location.origin,
    response_type: 'token',
    scope: GOOGLE_SCOPES.join(' '),
    include_granted_scopes: 'true',
    prompt: 'consent',
    state,
  });

  window.location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
}

export function parseOAuthCallbackFromHash(): {
  accessToken?: string;
  expiresIn?: number;
  error?: string;
} {
  if (typeof window === 'undefined' || !window.location.hash) {
    return {};
  }

  const hash = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash;

  if (!hash) return {};

  const params = new URLSearchParams(hash);
  const accessToken = params.get('access_token');
  const expiresInRaw = params.get('expires_in');
  const error = params.get('error');
  const errorDescription = params.get('error_description');
  const returnedState = params.get('state');

  if (!accessToken && !error) {
    return {};
  }

  // Clean the URL hash immediately so tokens do not linger in address bar/history
  window.history.replaceState(null, '', window.location.pathname + window.location.search);

  let expectedState: string | null = null;
  try {
    expectedState = sessionStorage.getItem(OAUTH_STATE_STORAGE_KEY);
    sessionStorage.removeItem(OAUTH_STATE_STORAGE_KEY);
  } catch {
    // Ignore sessionStorage restrictions
  }

  if (expectedState && returnedState && expectedState !== returnedState) {
    return { error: 'OAuth state mismatch. Please try connecting again.' };
  }

  if (error) {
    return { error: errorDescription || error };
  }

  if (accessToken) {
    const expiresIn = expiresInRaw ? parseInt(expiresInRaw, 10) : 3600;
    const validExpires = Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 3600;
    cachedAccessToken = accessToken;
    tokenExpiresAtMs = Date.now() + validExpires * 1000;
    return { accessToken, expiresIn: validExpires };
  }

  return {};
}

async function googleFetch(url: string, token: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  });
  if (res.status === 401) {
    cachedAccessToken = null;
    tokenExpiresAtMs = 0;
    throw new Error('Google session expired. Please reconnect.');
  }
  return res;
}

export async function fetchUserCalendarEmail(token: string): Promise<string | null> {
  try {
    const res = await googleFetch(
      'https://www.googleapis.com/calendar/v3/calendars/primary?fields=id,summary',
      token
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { id?: string; summary?: string };
    return data.id || data.summary || null;
  } catch {
    return null;
  }
}

// ==========================================
// 1. GOOGLE DRIVE APPDATA SYNC (study_sync.json)
// ==========================================

interface DriveFileMeta {
  id: string;
  name: string;
  modifiedTime: string;
}

async function findDriveSyncFile(token: string): Promise<DriveFileMeta | null> {
  const q = encodeURIComponent(`name='${SYNC_FILENAME}' and trashed=false`);
  const url = `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${q}&fields=files(id,name,modifiedTime)&pageSize=5`;
  const res = await googleFetch(url, token);
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Drive search failed (${res.status}): ${errText}`);
  }
  const data = (await res.json()) as { files?: DriveFileMeta[] };
  return data.files?.[0] || null;
}

async function downloadDriveSyncFile(token: string, fileId: string): Promise<StudyDatabase> {
  const res = await googleFetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    token
  );
  if (!res.ok) {
    throw new Error(`Failed to download ${SYNC_FILENAME} (${res.status})`);
  }
  return (await res.json()) as StudyDatabase;
}

async function uploadDriveSyncFile(
  token: string,
  db: StudyDatabase,
  existingFileId?: string | null
): Promise<DriveFileMeta> {
  const jsonBody = JSON.stringify(db);

  if (existingFileId) {
    const res = await googleFetch(
      `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=media&fields=id,name,modifiedTime`,
      token,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: jsonBody,
      }
    );
    if (!res.ok) {
      throw new Error(`Drive update failed (${res.status})`);
    }
    return (await res.json()) as DriveFileMeta;
  }

  // Create new file inside appDataFolder via multipart upload
  const boundary = 'cadence_sync_boundary_' + Math.random().toString(36).slice(2);
  const metadata = JSON.stringify({
    name: SYNC_FILENAME,
    parents: ['appDataFolder'],
    mimeType: 'application/json',
  });
  const multipartBody =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${metadata}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: application/json\r\n\r\n` +
    `${jsonBody}\r\n` +
    `--${boundary}--`;

  const res = await googleFetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime',
    token,
    {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: multipartBody,
    }
  );
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Drive upload failed (${res.status}): ${errText}`);
  }
  return (await res.json()) as DriveFileMeta;
}

export function mergeStudyDatabases(local: StudyDatabase, remote: StudyDatabase): StudyDatabase {
  const localTime = new Date(local.modifiedTime || 0).getTime();
  const remoteTime = new Date(remote.modifiedTime || 0).getTime();

  // Merge subjects by id (latest updatedAt wins)
  const subjectMap = new Map<string, Subject>();
  for (const s of remote.subjects || []) subjectMap.set(s.id, s);
  for (const s of local.subjects || []) {
    const existing = subjectMap.get(s.id);
    if (!existing || new Date(s.updatedAt).getTime() >= new Date(existing.updatedAt).getTime()) {
      subjectMap.set(s.id, s);
    }
  }

  // Merge tasks_metadata by google_task_id
  const tasksMap: Record<string, TaskMetadata> = { ...(remote.tasks_metadata || {}) };
  for (const [id, localTask] of Object.entries(local.tasks_metadata || {})) {
    const remoteTask = tasksMap[id];
    if (!remoteTask) {
      tasksMap[id] = localTask;
    } else {
      const lT = new Date(localTask.updatedAt || 0).getTime();
      const rT = new Date(remoteTask.updatedAt || 0).getTime();
      const winner = lT >= rT ? localTask : remoteTask;
      tasksMap[id] = {
        ...winner,
        logged_minutes: Math.max(localTask.logged_minutes || 0, remoteTask.logged_minutes || 0),
      };
    }
  }

  // Merge calendar_blocks by id
  const blockMap = new Map<string, CalendarBlock>();
  for (const b of remote.calendar_blocks || []) blockMap.set(b.id, b);
  for (const b of local.calendar_blocks || []) {
    const existing = blockMap.get(b.id);
    if (!existing || new Date(b.updatedAt).getTime() >= new Date(existing.updatedAt).getTime()) {
      blockMap.set(b.id, b);
    }
  }

  // Merge study_sessions (append-only union by id)
  const sessionMap = new Map<string, StudyDatabase['study_sessions'][number]>();
  for (const sess of remote.study_sessions || []) sessionMap.set(sess.id, sess);
  for (const sess of local.study_sessions || []) sessionMap.set(sess.id, sess);

  const settings = localTime >= remoteTime ? local.settings : remote.settings;

  return {
    version: Math.max(local.version || 1, remote.version || 1),
    modifiedTime: new Date().toISOString(),
    subjects: Array.from(subjectMap.values()),
    tasks_metadata: tasksMap,
    calendar_blocks: Array.from(blockMap.values()).filter((b) => !b.deleted),
    study_sessions: Array.from(sessionMap.values()).sort(
      (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    ),
    settings,
  };
}

// ==========================================
// 2. GOOGLE TASKS TWO-WAY SYNC
// ==========================================

interface GoogleTaskList {
  id: string;
  title: string;
  updated?: string;
}

interface GoogleTaskItem {
  id: string;
  title: string;
  notes?: string;
  status: 'needsAction' | 'completed';
  due?: string; // RFC 3339 timestamp e.g. 2026-11-18T00:00:00.000Z
  completed?: string;
  updated?: string;
  deleted?: boolean;
}

async function syncGoogleTasksBidirectional(
  token: string,
  db: StudyDatabase
): Promise<StudyDatabase> {
  const listsRes = await googleFetch(
    'https://tasks.googleapis.com/tasks/v1/users/@me/lists?maxResults=100',
    token
  );
  if (!listsRes.ok) {
    throw new Error(`Google Tasks list fetch failed (${listsRes.status})`);
  }
  const listsData = (await listsRes.json()) as { items?: GoogleTaskList[] };
  const remoteLists = listsData.items || [];

  const updatedSubjects = [...db.subjects];
  const updatedTasks: Record<string, TaskMetadata> = { ...db.tasks_metadata };
  let updatedBlocks = [...db.calendar_blocks];
  let updatedSessions = [...db.study_sessions];

  // Match local subjects to remote TaskLists by googleTaskListId or name, or create TaskLists
  for (const list of remoteLists) {
    const existing = updatedSubjects.find(
      (s) =>
        s.googleTaskListId === list.id ||
        s.name.trim().toLowerCase() === list.title.trim().toLowerCase()
    );
    if (existing) {
      existing.googleTaskListId = list.id;
    } else {
      updatedSubjects.push({
        id: `subj-gt-${list.id.slice(0, 8)}`,
        name: list.title,
        color: SUBJECT_COLORS[updatedSubjects.length % SUBJECT_COLORS.length],
        googleTaskListId: list.id,
        updatedAt: new Date().toISOString(),
      });
    }
  }

  // Create missing remote TaskLists for local Subjects
  for (const subj of updatedSubjects) {
    if (!subj.googleTaskListId) {
      const createListRes = await googleFetch(
        'https://tasks.googleapis.com/tasks/v1/users/@me/lists',
        token,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: subj.name }),
        }
      );
      if (createListRes.ok) {
        const created = (await createListRes.json()) as GoogleTaskList;
        subj.googleTaskListId = created.id;
      }
    }
  }

  // Sync tasks for each mapped Subject <-> TaskList
  for (const subj of updatedSubjects) {
    if (!subj.googleTaskListId) continue;
    const listId = subj.googleTaskListId;

    const tasksRes = await googleFetch(
      `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(
        listId
      )}/tasks?showCompleted=true&showHidden=true&maxResults=100`,
      token
    );
    if (!tasksRes.ok) continue;

    const tasksJson = (await tasksRes.json()) as { items?: GoogleTaskItem[] };
    const remoteTasks = tasksJson.items || [];
    const remoteMap = new Map<string, GoogleTaskItem>();
    for (const rt of remoteTasks) {
      if (!rt.deleted) remoteMap.set(rt.id, rt);
    }

    // 1. Pull or reconcile remote tasks
    for (const rt of remoteTasks) {
      if (rt.deleted) {
        delete updatedTasks[rt.id];
        continue;
      }
      const existing = updatedTasks[rt.id];
      const remoteDue = rt.due ? rt.due.slice(0, 10) : undefined;
      const remoteUpdatedMs = rt.updated ? new Date(rt.updated).getTime() : 0;

      if (!existing) {
        updatedTasks[rt.id] = {
          google_task_id: rt.id,
          googleTaskListId: listId,
          subjectId: subj.id,
          title: rt.title || 'Untitled Task',
          notes: rt.notes,
          due: remoteDue,
          status: rt.status,
          completedAt: rt.completed,
          estimated_minutes: 45,
          logged_minutes: 0,
          priority: 'medium',
          updatedAt: rt.updated || new Date().toISOString(),
        };
      } else {
        const localUpdatedMs = new Date(existing.updatedAt || 0).getTime();
        if (existing.deleted) {
          // User explicitly confirmed deletion locally -> delete on Google Tasks
          await googleFetch(
            `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(
              listId
            )}/tasks/${encodeURIComponent(rt.id)}`,
            token,
            { method: 'DELETE' }
          );
          delete updatedTasks[rt.id];
        } else if (remoteUpdatedMs > localUpdatedMs + 1500) {
          // Remote is newer -> update core fields, preserve study metadata
          updatedTasks[rt.id] = {
            ...existing,
            googleTaskListId: listId,
            subjectId: subj.id,
            title: rt.title || existing.title,
            notes: rt.notes ?? existing.notes,
            due: remoteDue,
            status: rt.status,
            completedAt: rt.completed ?? existing.completedAt,
            updatedAt: rt.updated || existing.updatedAt,
          };
        } else if (localUpdatedMs > remoteUpdatedMs + 1500) {
          // Local is newer -> push PATCH to Google Tasks
          await googleFetch(
            `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(
              listId
            )}/tasks/${encodeURIComponent(rt.id)}`,
            token,
            {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                id: rt.id,
                title: existing.title,
                notes: existing.notes || '',
                status: existing.status,
                due: existing.due ? `${existing.due}T00:00:00.000Z` : null,
              }),
            }
          );
        }
      }
    }

    // 2. Push local-only tasks belonging to this subject to Google Tasks
    for (const [localId, localTask] of Object.entries({ ...updatedTasks })) {
      if (localTask.subjectId !== subj.id || localTask.deleted) continue;
      if (remoteMap.has(localId)) continue;
      // Only create remotely if it wasn't already synced to a Google ID
      if (!localTask.googleTaskListId) {
        const createRes = await googleFetch(
          `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(listId)}/tasks`,
          token,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: localTask.title,
              notes: localTask.notes || undefined,
              status: localTask.status,
              due: localTask.due ? `${localTask.due}T00:00:00.000Z` : undefined,
            }),
          }
        );
        if (createRes.ok) {
          const created = (await createRes.json()) as GoogleTaskItem;
          delete updatedTasks[localId];
          updatedTasks[created.id] = {
            ...localTask,
            google_task_id: created.id,
            googleTaskListId: listId,
            updatedAt: created.updated || localTask.updatedAt,
          };
          updatedBlocks = updatedBlocks.map((b) =>
            b.taskId === localId ? { ...b, taskId: created.id } : b
          );
          updatedSessions = updatedSessions.map((s) =>
            s.taskId === localId ? { ...s, taskId: created.id } : s
          );
        }
      }
    }
  }

  // Clean out tombstoned tasks that weren't remote
  for (const [id, t] of Object.entries(updatedTasks)) {
    if (t.deleted) delete updatedTasks[id];
  }

  return {
    ...db,
    subjects: updatedSubjects,
    tasks_metadata: updatedTasks,
    calendar_blocks: updatedBlocks,
    study_sessions: updatedSessions,
    modifiedTime: new Date().toISOString(),
  };
}

// ==========================================
// 3. GOOGLE CALENDAR READ-ONLY OVERLAY
// ==========================================

interface GoogleCalendarEventRaw {
  id: string;
  summary?: string;
  htmlLink?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
}

export async function fetchGoogleCalendarOverlay(
  token: string,
  weekStart: Date,
  weekEnd: Date
): Promise<GoogleCalendarEventOverlay[]> {
  const timeMin = new Date(
    weekStart.getFullYear(),
    weekStart.getMonth(),
    weekStart.getDate(),
    0,
    0,
    0
  ).toISOString();
  const timeMax = new Date(
    weekEnd.getFullYear(),
    weekEnd.getMonth(),
    weekEnd.getDate(),
    23,
    59,
    59
  ).toISOString();

  const url =
    `https://www.googleapis.com/calendar/v3/calendars/primary/events` +
    `?timeMin=${encodeURIComponent(timeMin)}` +
    `&timeMax=${encodeURIComponent(timeMax)}` +
    `&singleEvents=true&orderBy=startTime&maxResults=100`;

  const res = await googleFetch(url, token);
  if (!res.ok) {
    throw new Error(`Calendar fetch failed (${res.status})`);
  }

  const data = (await res.json()) as { items?: GoogleCalendarEventRaw[]; summary?: string };
  const overlays: GoogleCalendarEventOverlay[] = [];

  for (const ev of data.items || []) {
    if (ev.start?.dateTime && ev.end?.dateTime) {
      const startDt = new Date(ev.start.dateTime);
      const endDt = new Date(ev.end.dateTime);
      const dateKey = toLocalDateKey(startDt);
      const startMinutes = startDt.getHours() * 60 + startDt.getMinutes();
      const durationMinutes = Math.max(
        15,
        Math.round((endDt.getTime() - startDt.getTime()) / 60_000)
      );
      overlays.push({
        id: ev.id,
        summary: ev.summary || '(Busy)',
        date: dateKey,
        startMinutes,
        durationMinutes,
        isAllDay: false,
        calendarName: data.summary,
        htmlLink: ev.htmlLink,
      });
    } else if (ev.start?.date) {
      overlays.push({
        id: ev.id,
        summary: ev.summary || '(All-day event)',
        date: ev.start.date,
        startMinutes: 6 * 60,
        durationMinutes: 45,
        isAllDay: true,
        calendarName: data.summary,
        htmlLink: ev.htmlLink,
      });
    }
  }

  return overlays;
}

// ==========================================
// 4. FULL ORCHESTRATED SYNC
// ==========================================

export async function performFullGoogleSync(params: {
  token: string;
  localDb: StudyDatabase;
  knownRemoteFileId: string | null;
  knownRemoteModifiedTime: string | null;
  hasPendingLocalEdits: boolean;
  weekStart: Date;
  weekEnd: Date;
}): Promise<{
  mergedDb: StudyDatabase;
  remoteFileId: string;
  remoteModifiedTime: string;
  calendarEvents: GoogleCalendarEventOverlay[];
}> {
  const {
    token,
    localDb,
    knownRemoteFileId,
    knownRemoteModifiedTime,
    hasPendingLocalEdits,
    weekStart,
    weekEnd,
  } = params;

  // Step 1: Check Drive AppData study_sync.json
  const remoteMeta = await findDriveSyncFile(token);
  let workingDb = localDb;

  if (remoteMeta) {
    const remoteChanged =
      !knownRemoteModifiedTime ||
      new Date(remoteMeta.modifiedTime).getTime() > new Date(knownRemoteModifiedTime).getTime();

    if (remoteChanged || !hasPendingLocalEdits) {
      const remoteDb = await downloadDriveSyncFile(token, remoteMeta.id);
      workingDb = hasPendingLocalEdits
        ? mergeStudyDatabases(localDb, remoteDb)
        : new Date(remoteDb.modifiedTime || 0).getTime() >
          new Date(localDb.modifiedTime || 0).getTime()
        ? remoteDb
        : mergeStudyDatabases(localDb, remoteDb);
    }
  }

  // Step 2: Two-way Google Tasks Sync
  workingDb = await syncGoogleTasksBidirectional(token, workingDb);

  // Step 3: Push consolidated study_sync.json to Drive AppData
  const savedMeta = await uploadDriveSyncFile(
    token,
    workingDb,
    remoteMeta?.id || knownRemoteFileId
  );

  // Step 4: Pull read-only Google Calendar overlay for active week
  const calendarEvents = await fetchGoogleCalendarOverlay(token, weekStart, weekEnd);

  return {
    mergedDb: workingDb,
    remoteFileId: savedMeta.id,
    remoteModifiedTime: savedMeta.modifiedTime,
    calendarEvents,
  };
}
