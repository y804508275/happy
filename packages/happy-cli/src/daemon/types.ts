/**
 * Daemon-specific types (not related to API/server communication)
 */

import { Metadata } from '@/api/types';
import { ChildProcess } from 'child_process';

/**
 * Session tracking for daemon
 */
export interface TrackedSession {
  startedBy: 'daemon' | string;
  happySessionId?: string;
  happySessionMetadataFromLocalWebhook?: Metadata;
  pid: number;
  childProcess?: ChildProcess;
  error?: string;
  directoryCreated?: boolean;
  message?: string;
  /** tmux session identifier (format: session:window) */
  tmuxSessionId?: string;
}

/**
 * Serializable subset of TrackedSession for disk persistence.
 * Does not include ChildProcess (non-serializable).
 * Used to re-adopt sessions after daemon restart.
 */
export interface PersistedTrackedSession {
  pid: number;
  startedBy: 'daemon' | string;
  happySessionId?: string;
  directory?: string;
  claudeSessionId?: string;
  tmuxSessionId?: string;
  agent?: string;
  trackedAt: number;
}