import { create } from 'zustand';
import { createLogger } from '@mister-guiiug/dev-pwa-config/logger';
import { backend } from '../../backend/index.ts';
import {
  BackendError,
  type Space,
  type SpaceInput,
  type SpacePatch,
} from '../../backend/ports.ts';

const log = createLogger('espaces');

/** Ce qu'un écran peut dire d'un échec : le code du port, et son détail. */
export interface UiError {
  code: BackendError['code'];
  detail: string;
}

export function toUiError(cause: unknown): UiError {
  if (cause instanceof BackendError) {
    return { code: cause.code, detail: cause.detail ?? cause.message };
  }
  return {
    code: 'unknown',
    detail: cause instanceof Error ? cause.message : String(cause),
  };
}

interface SpacesState {
  spaces: Space[];
  /** `false` tant que la première lecture n'a pas rendu. */
  ready: boolean;
  error: UiError | null;
  load: () => Promise<void>;
  create: (input: SpaceInput) => Promise<Space | null>;
  update: (
    id: string,
    patch: SpacePatch,
    expectedVersion: number
  ) => Promise<Space | null>;
  archive: (
    id: string,
    archived: boolean,
    expectedVersion: number
  ) => Promise<Space | null>;
  remove: (id: string) => Promise<boolean>;
  clearError: () => void;
}

/**
 * Le magasin des espaces : Zustand pour l'état vivant, le PORT pour ce qui
 * survit (ADR 0002). Les écritures qui touchent une ligne portent la version
 * attendue ; un `conflict` remonte tel quel, et l'écran dit de recharger
 * (ADR 0015) — jamais de fusion silencieuse.
 */
export const useSpaces = create<SpacesState>((set, get) => ({
  spaces: [],
  ready: false,
  error: null,

  async load() {
    try {
      const spaces = await backend.spaces.list();
      set({ spaces, ready: true, error: null });
    } catch (cause) {
      log.error('lecture des espaces', { cause });
      set({ ready: true, error: toUiError(cause) });
    }
  },

  async create(input) {
    try {
      const space = await backend.spaces.create(input);
      set({ spaces: [...get().spaces, space], error: null });
      return space;
    } catch (cause) {
      log.error('création d’un espace', { cause });
      set({ error: toUiError(cause) });
      return null;
    }
  },

  async update(id, patch, expectedVersion) {
    try {
      const space = await backend.spaces.update(id, patch, expectedVersion);
      set({
        spaces: get().spaces.map(s => (s.id === id ? space : s)),
        error: null,
      });
      return space;
    } catch (cause) {
      log.error('mise à jour d’un espace', { cause });
      set({ error: toUiError(cause) });
      return null;
    }
  },

  async archive(id, archived, expectedVersion) {
    try {
      const space = await backend.spaces.archive(id, archived, expectedVersion);
      set({
        spaces: get().spaces.map(s => (s.id === id ? space : s)),
        error: null,
      });
      return space;
    } catch (cause) {
      log.error('archivage d’un espace', { cause });
      set({ error: toUiError(cause) });
      return null;
    }
  },

  async remove(id) {
    const precedent = get().spaces;
    set({ spaces: precedent.filter(s => s.id !== id) });
    try {
      await backend.spaces.remove(id);
      set({ error: null });
      return true;
    } catch (cause) {
      log.error('suppression d’un espace', { cause });
      set({ spaces: precedent, error: toUiError(cause) });
      return false;
    }
  },

  clearError() {
    set({ error: null });
  },
}));
