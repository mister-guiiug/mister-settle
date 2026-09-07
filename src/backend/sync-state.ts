import { create } from 'zustand';

/**
 * L'ÉTAT DE LA SYNCHRONISATION, en un seul endroit, lisible par les écrans et
 * écrit par l'infrastructure : le réseau, la copie servie faute de mieux, la
 * file des créations en attente, les lettres mortes. Un magasin Zustand sans
 * React : la cache de lecture et la file l'alimentent hors de tout rendu.
 */
export interface SyncState {
  online: boolean;
  /** Date de la copie servie faute de réseau ; `null` quand on lit le vrai. */
  staleAt: string | null;
  pending: number;
  dead: number;
  /** Compte les créations parties : un écran ouvert relit alors ses dépenses. */
  doneCount: number;
  setOnline: (online: boolean) => void;
  markStale: (at: string) => void;
  markFresh: () => void;
  setQueue: (status: { pending: number; dead: number }) => void;
  noteDone: () => void;
}

export type SyncStatus = 'synced' | 'pending' | 'offline' | 'error';

/** Un seul mot pour la pastille : hors ligne prime, puis les refus, puis l'attente. */
export function syncStatusOf(state: {
  online: boolean;
  pending: number;
  dead: number;
}): SyncStatus {
  if (!state.online) return 'offline';
  if (state.dead > 0) return 'error';
  if (state.pending > 0) return 'pending';
  return 'synced';
}

export const useSyncState = create<SyncState>(set => ({
  online: typeof navigator === 'undefined' ? true : navigator.onLine !== false,
  staleAt: null,
  pending: 0,
  dead: 0,
  doneCount: 0,
  setOnline: online => set({ online }),
  markStale: at => set({ staleAt: at }),
  markFresh: () => set({ staleAt: null }),
  setQueue: ({ pending, dead }) => set({ pending, dead }),
  noteDone: () => set(state => ({ doneCount: state.doneCount + 1 })),
}));
