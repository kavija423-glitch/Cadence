import type {
  CalendarBlock,
  GoogleCalendarEventOverlay,
  StudyDatabase,
  Subject,
  TaskMetadata,
} from '../types';
import { toLocalDateKey } from '../utils/dateUtils';
import { parseRepeatFromNotes, syncRepeatMetadataInNotes } from '../utils/recurrence';
import { SUBJECT_COLORS } from '../utils/seedData';

export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/drive.appdata',
  'https://www.googleapis.com/auth/tasks',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];

const CLIENT_ID_STORAGE_KEY = 'cadence_google_client_id';
const GOOGLE_SESSION_STORAGE_KEY = 'cadence_google_session_v1';
const OAUTH_STATE_STORAGE_KEY = 'cadence_oauth_state';
const SYNC_FILENAME = 'study_sync.json';
const EXPIRY_BUFFER_MS = 60_000;

export interface StoredGoogleSession {
  access_token: string;
  expires_at: number;
  email?: string;
  name?: string;
}

interface GisTokenResponse {
  access_token?: string;
  expires_in?: number | string;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
}

interface GisTokenClientError {
  type?: string;
  message?: string;
}

interface GisTokenClient {
  requestAccessToken: (overrideConfig?: {
    prompt?: string;
    hint?: string;
    scope?: string;
  }) => void;
}

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            hint?: string;
            prompt?: string;
            callback: (response: GisTokenResponse) => void;
            error_callback?: (error: GisTokenClientError) => void;
          }) => GisTokenClient;
        };
      };
    };
  }
}

export class GoogleAuthInteractionRequiredError extends Error {
  readonly code: string;

  constructor(code: string, message?: string) {
    super(message || 'Google session expired. Please reconnect.');
    this.name = 'GoogleAuthInteractionRequiredError';
    this.code = code;
  }
}

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

export function getStoredGoogleSession(): StoredGoogleSession | null {
  try {
    const raw = localStorage.getItem(GOOGLE_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredGoogleSession;
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveStoredGoogleSession(session: StoredGoogleSession): void {
  try {
    localStorage.setItem(GOOGLE_SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Ignore storage errors
  }
}

function computeExpiresAtMs(expiresIn: number | string | undefined): number {
  const sec = typeof expiresIn === 'string' ? parseInt(expiresIn, 10) : Number(expiresIn);
  const validSec = Number.isFinite(sec) && sec > 0 ? sec : 3600;
  return Date.now() + validSec * 1000 - EXPIRY_BUFFER_MS;
}

export function markStoredTokenExpired(): void {
  const existing = getStoredGoogleSession();
  if (!existing) return;
  if (existing.email || existing.name) {
    saveStoredGoogleSession({
      access_token: '',
      expires_at: 0,
      email: existing.email,
      name: existing.name,
    });
  } else {
    try {
      localStorage.removeItem(GOOGLE_SESSION_STORAGE_KEY);
    } catch {
      // Ignore
    }
  }
}

export function hasValidAccessToken(): boolean {
  const session = getStoredGoogleSession();
  return !!(session?.access_token && Date.now() < session.expires_at);
}

export function getAccessToken(): string | null {
  const session = getStoredGoogleSession();
  if (session?.access_token && Date.now() < session.expires_at) {
    return session.access_token;
  }
  return null;
}

export function getStoredUserProfile(): { email: string | null; name: string | null } {
  const session = getStoredGoogleSession();
  return {
    email: session?.email || null,
    name: session?.name || null,
  };
}

export function clearAccessToken(): void {
  const session = getStoredGoogleSession();
  const token = session?.access_token;
  try {
    localStorage.removeItem(GOOGLE_SESSION_STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
  if (token) {
    fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
      method: 'POST',
    }).catch(() => {
      // Ignore revoke network errors
    });
  }
}

export async function fetchGoogleUserProfile(token: string): Promise<{
  email: string | null;
  name: string | null;
}> {
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = (await res.json()) as { email?: string; name?: string };
      if (data.email || data.name) {
        return {
          email: data.email || null,
          name: data.name || null,
        };
      }
    }
  } catch {
    // Fallback to calendar primary email below
  }

  const calEmail = await fetchUserCalendarEmail(token);
  return { email: calEmail, name: null };
}

export async function fetchUserCalendarEmail(token: string): Promise<string | null> {
  try {
    const res = await fetch(
      'https://www.googleapis.com/calendar/v3/calendars/primary?fields=id,summary',
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { id?: string; summary?: string };
    return data.id || data.summary || null;
  } catch {
    return null;
  }
}

async function persistTokenAndProfile(response: GisTokenResponse): Promise<{
  accessToken: string;
  expiresAt: number;
  email: string | null;
  name: string | null;
}> {
  const accessToken = response.access_token || '';
  const expiresAt = computeExpiresAtMs(response.expires_in);
  const existing = getStoredGoogleSession();

  // Save token immediately so concurrent calls can read it even before UserInfo resolves
  saveStoredGoogleSession({
    access_token: accessToken,
    expires_at: expiresAt,
    email: existing?.email,
    name: existing?.name,
  });

  const fetched = await fetchGoogleUserProfile(accessToken);
  const email = fetched.email || existing?.email || null;
  const name = fetched.name || existing?.name || null;

  saveStoredGoogleSession({
    access_token: accessToken,
    expires_at: expiresAt,
    email: email || undefined,
    name: name || undefined,
  });

  return { accessToken, expiresAt, email, name };
}

async function ensureGsiLoaded(timeoutMs = 10_000): Promise<void> {
  if (typeof window === 'undefined') {
    throw new Error('Google Identity Services requires a browser environment.');
  }
  if (window.google?.accounts?.oauth2?.initTokenClient) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const start = Date.now();
    let script = document.querySelector<HTMLScriptElement>(
      'script[src*="accounts.google.com/gsi/client"]'
    );
    if (!script) {
      script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }

    const checkInterval = window.setInterval(() => {
      if (window.google?.accounts?.oauth2?.initTokenClient) {
        window.clearInterval(checkInterval);
        resolve();
        return;
      }
      if (Date.now() - start >= timeoutMs) {
        window.clearInterval(checkInterval);
        reject(new Error('Google Identity Services failed to load. Check your network connection.'));
      }
    }, 50);

    script.addEventListener(
      'error',
      () => {
        window.clearInterval(checkInterval);
        reject(new Error('Could not load Google Identity Services script.'));
      },
      { once: true }
    );
  });
}

let inFlightSilentRefresh: Promise<string> | null = null;

export async function silentRefreshGoogleToken(
  explicitClientId?: string,
  explicitHint?: string
): Promise<string> {
  if (inFlightSilentRefresh) {
    return inFlightSilentRefresh;
  }

  const resolvedClientId = (explicitClientId || getSavedClientId()).trim();
  const savedProfile = getStoredUserProfile();
  const resolvedHint = explicitHint || savedProfile.email || undefined;

  if (!resolvedClientId) {
    throw new GoogleAuthInteractionRequiredError(
      'missing_client_id',
      'Google OAuth Client ID is not configured.'
    );
  }

  inFlightSilentRefresh = (async () => {
    await ensureGsiLoaded();

    return await new Promise<string>((resolve, reject) => {
      let settled = false;
      const timer = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        markStoredTokenExpired();
        reject(
          new GoogleAuthInteractionRequiredError(
            'interaction_required',
            'Silent Google refresh timed out. Please reconnect Google.'
          )
        );
      }, 12_000);

      const finishReject = (code: string, msg?: string) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        markStoredTokenExpired();
        reject(new GoogleAuthInteractionRequiredError(code, msg));
      };

      try {
        const tokenClient = window.google!.accounts!.oauth2!.initTokenClient({
          client_id: resolvedClientId,
          scope: GOOGLE_SCOPES.join(' '),
          hint: resolvedHint,
          callback: (response) => {
            if (settled) return;
            if (response.error || !response.access_token) {
              const errCode = response.error || 'interaction_required';
              finishReject(
                errCode,
                response.error_description || 'Silent Google sign-in requires user interaction.'
              );
              return;
            }
            settled = true;
            window.clearTimeout(timer);
            void persistTokenAndProfile(response)
              .then((saved) => resolve(saved.accessToken))
              .catch(() => resolve(response.access_token!));
          },
          error_callback: (err) => {
            finishReject(
              err.type || 'interaction_required',
              err.message || 'Silent Google sign-in could not complete.'
            );
          },
        });

        tokenClient.requestAccessToken({
          prompt: 'none',
          hint: resolvedHint,
        });
      } catch (err) {
        finishReject(
          'interaction_required',
          err instanceof Error ? err.message : 'Silent Google refresh failed.'
        );
      }
    });
  })().finally(() => {
    inFlightSilentRefresh = null;
  });

  return inFlightSilentRefresh;
}

export async function requestInteractiveGoogleToken(
  clientId: string,
  options?: { hint?: string; prompt?: '' | 'consent' | 'select_account' }
): Promise<{
  accessToken: string;
  expiresAt: number;
  email: string | null;
  name: string | null;
}> {
  const trimmedId = clientId.trim();
  if (!trimmedId) {
    throw new Error('Please paste your Google OAuth Client ID first.');
  }

  await ensureGsiLoaded();
  const savedProfile = getStoredUserProfile();
  const hint = options?.hint || savedProfile.email || undefined;
  const prompt = options?.prompt !== undefined ? options.prompt : hint ? '' : 'select_account';

  return await new Promise((resolve, reject) => {
    let settled = false;
    try {
      const tokenClient = window.google!.accounts!.oauth2!.initTokenClient({
        client_id: trimmedId,
        scope: GOOGLE_SCOPES.join(' '),
        hint,
        callback: (response) => {
          if (settled) return;
          settled = true;
          if (response.error || !response.access_token) {
            reject(
              new Error(
                response.error_description ||
                  response.error ||
                  'Google authorization was not completed.'
              )
            );
            return;
          }
          void persistTokenAndProfile(response).then(resolve).catch(reject);
        },
        error_callback: (err) => {
          if (settled) return;
          settled = true;
          reject(
            new Error(
              err.type === 'popup_failed_to_open'
                ? 'Browser blocked the Google sign-in popup. Please allow popups for this site.'
                : err.message || 'Google sign-in was cancelled.'
            )
          );
        },
      });

      tokenClient.requestAccessToken({
        prompt,
        hint,
      });
    } catch (err) {
      if (!settled) {
        settled = true;
        reject(err instanceof Error ? err : new Error('Failed to start Google sign-in.'));
      }
    }
  });
}

export async function ensureValidGoogleToken(): Promise<string | null> {
  const valid = getAccessToken();
  if (valid) return valid;

  const session = getStoredGoogleSession();
  const clientId = getSavedClientId();
  if (session?.email && clientId && (typeof navigator === 'undefined' || navigator.onLine)) {
    return await silentRefreshGoogleToken(clientId, session.email);
  }
  return null;
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
    const existing = getStoredGoogleSession();
    saveStoredGoogleSession({
      access_token: accessToken,
      expires_at: computeExpiresAtMs(validExpires),
      email: existing?.email,
      name: existing?.name,
    });
    return { accessToken, expiresIn: validExpires };
  }

  return {};
}

async function googleFetch(
  url: string,
  token: string,
  init: RequestInit = {},
  allowRetry = true
): Promise<Response> {
  const bearerToken = getAccessToken() || token;
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init.headers || {}),
      Authorization: `Bearer ${bearerToken}`,
    },
  });

  if (res.status === 401) {
    markStoredTokenExpired();
    const clientId = getSavedClientId();
    const { email } = getStoredUserProfile();

    if (allowRetry && clientId && email) {
      const refreshedToken = await silentRefreshGoogleToken(clientId, email);
      return googleFetch(url, refreshedToken, init, false);
    }

    throw new GoogleAuthInteractionRequiredError(
      'interaction_required',
      'Google session expired. Please reconnect.'
    );
  }

  return res;
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
      const { cleanNotes, repeat: parsedRepeat } = parseRepeatFromNotes(rt.notes);

      if (!existing) {
        updatedTasks[rt.id] = {
          google_task_id: rt.id,
          googleTaskListId: listId,
          subjectId: subj.id,
          title: rt.title || 'Untitled Task',
          notes: cleanNotes,
          due: remoteDue,
          status: rt.status,
          completedAt: rt.completed,
          estimated_minutes: 45,
          logged_minutes: 0,
          priority: 'medium',
          repeat: parsedRepeat,
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
            notes: rt.notes !== undefined ? cleanNotes : existing.notes,
            due: remoteDue,
            status: rt.status,
            completedAt: rt.completed ?? existing.completedAt,
            repeat: parsedRepeat ?? (rt.notes !== undefined ? undefined : existing.repeat),
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
                notes: syncRepeatMetadataInNotes(existing.notes, existing.repeat),
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
        const serializedNotes = syncRepeatMetadataInNotes(localTask.notes, localTask.repeat);
        const createRes = await googleFetch(
          `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(listId)}/tasks`,
          token,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: localTask.title,
              notes: serializedNotes || undefined,
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

export async function overwriteDriveSyncFile(params: {
  token: string;
  emptyDb: StudyDatabase;
  knownRemoteFileId: string | null;
}): Promise<{ remoteFileId: string; remoteModifiedTime: string }> {
  const { token, emptyDb, knownRemoteFileId } = params;
  const targetId = knownRemoteFileId || (await findDriveSyncFile(token))?.id || null;
  const savedMeta = await uploadDriveSyncFile(token, emptyDb, targetId);
  return {
    remoteFileId: savedMeta.id,
    remoteModifiedTime: savedMeta.modifiedTime,
  };
}
