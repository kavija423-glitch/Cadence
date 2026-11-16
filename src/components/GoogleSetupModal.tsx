import React, { useState } from 'react';
import {
  X,
  RefreshCw,
  Download,
  Upload,
  CheckCircle2,
  AlertCircle,
  KeyRound,
  LogOut,
  Plus,
  Trash2,
  Copy,
  Check,
} from 'lucide-react';
import type { Subject, SyncStatusInfo } from '../types';
import { formatRelativeTime } from '../utils/dateUtils';
import { SUBJECT_COLORS } from '../utils/seedData';

interface GoogleSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientId: string;
  onSaveClientId: (id: string) => void;
  isConnected: boolean;
  syncStatus: SyncStatusInfo;
  onConnect: () => Promise<void>;
  onDisconnect: () => void;
  onSyncNow: () => Promise<void>;
  onDownloadBackup: () => void;
  onImportBackup: (file: File) => Promise<void>;
  subjects: Subject[];
  onAddSubject: (name: string, color: string) => void;
  onDeleteSubject: (id: string) => void;
  dailyGoalMinutes: number;
  onUpdateDailyGoal: (mins: number) => void;
  onResetWorkspace: (mode: 'sample' | 'empty') => void;
}

export const GoogleSetupModal: React.FC<GoogleSetupModalProps> = ({
  isOpen,
  onClose,
  clientId,
  onSaveClientId,
  isConnected,
  syncStatus,
  onConnect,
  onDisconnect,
  onSyncNow,
  onDownloadBackup,
  onImportBackup,
  subjects,
  onAddSubject,
  onDeleteSubject,
  dailyGoalMinutes,
  onUpdateDailyGoal,
  onResetWorkspace,
}) => {
  const [draftClientId, setDraftClientId] = useState(clientId);
  const [newSubjectName, setNewSubjectName] = useState('');
  const [newSubjectColor, setNewSubjectColor] = useState(SUBJECT_COLORS[0]);
  const [copiedOrigin, setCopiedOrigin] = useState(false);
  const [confirmReset, setConfirmReset] = useState<'sample' | 'empty' | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  if (!isOpen) return null;

  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';

  const handleCopyOrigin = async () => {
    try {
      await navigator.clipboard.writeText(currentOrigin);
      setCopiedOrigin(true);
      setTimeout(() => setCopiedOrigin(false), 1800);
    } catch {
      // Ignore clipboard failures
    }
  };

  const handleConnectClick = async () => {
    onSaveClientId(draftClientId.trim());
    await onConnect();
  };

  const handleAddSubjectSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newSubjectName.trim();
    if (!trimmed) return;
    onAddSubject(trimmed, newSubjectColor);
    setNewSubjectName('');
    const nextIdx = (SUBJECT_COLORS.indexOf(newSubjectColor) + 1) % SUBJECT_COLORS.length;
    setNewSubjectColor(SUBJECT_COLORS[nextIdx]);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(null);
    try {
      await onImportBackup(file);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Invalid backup JSON file.');
    }
    e.target.value = '';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/50 backdrop-blur-xs p-0 sm:p-4">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Sync, Google Setup & Preferences
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              100% client-side OAuth 2.0 redirect · Stored locally and synced to your Drive AppData
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-8">
          {/* Section 1: Google Cloud GIS OAuth Setup */}
          <section className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Google Cloud Sync (Zero Backend)
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Scopes: Drive AppData (<code className="font-mono">study_sync.json</code>), Google Tasks (2-way), Calendar (read-only)
                </p>
              </div>
              {isConnected && (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="w-4 h-4" />
                  Connected
                </span>
              )}
            </div>

            {/* Client ID Input */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 p-4 space-y-3">
              <label
                htmlFor="google-client-id"
                className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                <KeyRound className="w-3.5 h-3.5 text-slate-500" />
                Google OAuth 2.0 Web Client ID (saved to localStorage)
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  id="google-client-id"
                  type="text"
                  value={draftClientId}
                  onChange={(e) => setDraftClientId(e.target.value)}
                  placeholder="1234567890-abc123def.apps.googleusercontent.com"
                  className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-mono text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
                <button
                  type="button"
                  onClick={() => onSaveClientId(draftClientId.trim())}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Save ID
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs text-slate-500 dark:text-slate-400">
                <span>
                  Authorized Redirect URI:{' '}
                  <code className="font-mono text-slate-700 dark:text-slate-300">{currentOrigin}</code>
                </span>
                <button
                  type="button"
                  onClick={handleCopyOrigin}
                  className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                >
                  {copiedOrigin ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedOrigin ? 'Copied' : 'Copy URI'}
                </button>
              </div>
            </div>

            {/* Official Google Sign-In / Sync Controls */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              {!isConnected ? (
                <button
                  type="button"
                  onClick={handleConnectClick}
                  disabled={!draftClientId.trim() || syncStatus.state === 'connecting'}
                  className="inline-flex items-center gap-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm font-medium text-slate-800 dark:text-slate-100 shadow-xs hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 48 48" aria-hidden="true">
                    <path
                      fill="#EA4335"
                      d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                    />
                    <path
                      fill="#4285F4"
                      d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                    />
                    <path
                      fill="#34A853"
                      d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                    />
                  </svg>
                  <span>
                    {syncStatus.state === 'connecting' ? 'Redirecting...' : 'Sign in with Google'}
                  </span>
                </button>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={onSyncNow}
                    disabled={syncStatus.state === 'syncing'}
                    className="inline-flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 px-4 py-2 text-xs font-medium text-white transition-colors disabled:opacity-60 cursor-pointer"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${syncStatus.state === 'syncing' ? 'animate-spin' : ''}`}
                    />
                    {syncStatus.state === 'syncing' ? 'Syncing...' : 'Sync Now'}
                  </button>
                  <button
                    type="button"
                    onClick={onDisconnect}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Disconnect
                  </button>
                </div>
              )}

              <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                {syncStatus.userEmail && <span>{syncStatus.userEmail} · </span>}
                Last sync: {formatRelativeTime(syncStatus.lastSyncedAt)}
              </div>
            </div>

            {syncStatus.errorMessage && (
              <div className="flex items-start gap-2 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 px-3.5 py-2.5 text-xs text-rose-700 dark:text-rose-300">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{syncStatus.errorMessage}</span>
              </div>
            )}
          </section>

          <hr className="border-slate-200 dark:border-slate-800" />

          {/* Section 2: Subjects & Task List Mapping */}
          <section className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Subjects (Mapped to Google Task Lists)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Each subject maps 1:1 to a Google Task List when synced.
              </p>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-800">
              {subjects.map((s) => (
                <div key={s.id} className="flex items-center justify-between px-3.5 py-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className="w-3 h-3 rounded-sm shrink-0"
                      style={{ backgroundColor: s.color }}
                    />
                    <span className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                      {s.name}
                    </span>
                    {s.googleTaskListId && (
                      <span className="text-xs text-slate-400 dark:text-slate-500 whitespace-nowrap">
                        · Synced List
                      </span>
                    )}
                  </div>
                  {subjects.length > 1 && (
                    <button
                      type="button"
                      onClick={() => onDeleteSubject(s.id)}
                      className="p-1.5 rounded-md text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors cursor-pointer"
                      title={`Remove ${s.name}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            <form onSubmit={handleAddSubjectSubmit} className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-2 py-1.5">
                {SUBJECT_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setNewSubjectColor(c)}
                    className={`w-4 h-4 rounded-sm transition-transform cursor-pointer ${
                      newSubjectColor === c ? 'scale-125 ring-2 ring-slate-400 dark:ring-slate-500' : ''
                    }`}
                    style={{ backgroundColor: c }}
                    aria-label={`Select color ${c}`}
                  />
                ))}
              </div>
              <input
                type="text"
                value={newSubjectName}
                onChange={(e) => setNewSubjectName(e.target.value)}
                placeholder="New subject (e.g., Linear Algebra)"
                className="flex-1 min-w-[180px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 dark:bg-slate-100 px-3.5 py-1.5 text-xs font-medium text-white dark:text-slate-900 hover:opacity-90 transition-opacity cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Subject
              </button>
            </form>
          </section>

          <hr className="border-slate-200 dark:border-slate-800" />

          {/* Section 3: Daily Goal & Backups */}
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Daily Study Goal & Portable Backups
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Export or restore your full <code className="font-mono">study_sync.json</code> database anytime.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <label
                  htmlFor="daily-goal-select"
                  className="text-xs text-slate-600 dark:text-slate-300"
                >
                  Daily target
                </label>
                <select
                  id="daily-goal-select"
                  value={dailyGoalMinutes}
                  onChange={(e) => onUpdateDailyGoal(Number(e.target.value))}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs font-mono tabular-nums text-slate-900 dark:text-slate-100"
                >
                  <option value={60}>1h / day</option>
                  <option value={120}>2h / day</option>
                  <option value={180}>3h / day</option>
                  <option value={240}>4h / day</option>
                  <option value={360}>6h / day</option>
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onDownloadBackup}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                Download Backup JSON
              </button>

              <label className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer">
                <Upload className="w-3.5 h-3.5 text-slate-500" />
                <span>Restore JSON</span>
                <input
                  type="file"
                  accept="application/json,.json"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>

              {!confirmReset ? (
                <button
                  type="button"
                  onClick={() => setConfirmReset('empty')}
                  className="ml-auto text-xs text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 transition-colors cursor-pointer"
                >
                  Clear local data...
                </button>
              ) : (
                <div className="ml-auto flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onResetWorkspace('empty');
                      setConfirmReset(null);
                    }}
                    className="rounded-lg bg-rose-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-rose-700 cursor-pointer"
                  >
                    Confirm Clear All
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onResetWorkspace('sample');
                      setConfirmReset(null);
                    }}
                    className="rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
                  >
                    Restore Demo
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmReset(null)}
                    className="text-xs text-slate-500 px-1.5 py-1 cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>

            {importError && (
              <p className="text-xs text-rose-600 dark:text-rose-400">{importError}</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};
