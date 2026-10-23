'use client';

/**
 * Who is signed in, their points and the AI prices, from SIET Space
 * (`GET /community/me`), shared by every component of the page.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { api, ApiError, getWorkspaceToken } from './workspace';

export interface WorkspaceMe {
  user: { id: string; username?: string; display_name?: string; email?: string; avatar_url?: string | null; role?: string };
  balance: number;
  exempt: boolean;
  costs: Record<string, number>;
}

export interface WorkspaceState {
  status: 'loading' | 'ready' | 'signed-out' | 'error';
  me: WorkspaceMe | null;
  error: string | null;
}

const LOADING: WorkspaceState = { status: 'loading', me: null, error: null };
let state: WorkspaceState = LOADING;
let started = false;
const subscribers = new Set<() => void>();

function set(next: Partial<WorkspaceState>) {
  state = { ...state, ...next };
  subscribers.forEach((notify) => notify());
}

export async function refreshWorkspace(): Promise<void> {
  if (!getWorkspaceToken()) {
    set({ status: 'signed-out', me: null, error: null });
    return;
  }
  try {
    set({ status: 'ready', me: await api<WorkspaceMe>('ws/community/me'), error: null });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) set({ status: 'signed-out', me: null, error: null });
    else set({ status: 'error', error: error instanceof Error ? error.message : String(error) });
  }
}

/** The balance a generation answered with, without asking the API again. */
export function setBalance(balance: number | null | undefined) {
  if (state.me && typeof balance === 'number') set({ me: { ...state.me, balance } });
}

export function useWorkspace(): WorkspaceState {
  const snapshot = useSyncExternalStore(
    (notify) => {
      subscribers.add(notify);
      return () => subscribers.delete(notify);
    },
    () => state,
    () => LOADING
  );
  useEffect(() => {
    if (!started) {
      started = true;
      void refreshWorkspace();
    }
  }, []);
  return snapshot;
}
