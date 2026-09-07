import { useEffect } from 'react';
import { create } from 'zustand';
import { createLogger } from '@mister-guiiug/dev-pwa-config/logger';
import { backend } from '../../backend/index.ts';
import type {
  Invitation,
  InvitationInput,
  SpaceRole,
} from '../../backend/ports.ts';
import { toUiError, type UiError } from '../spaces/store.ts';

const log = createLogger('invitations');

export interface Accepted {
  spaceId: string;
  participantId: string | null;
  role: SpaceRole;
}

interface InvitationsState {
  spaceId: string | null;
  invitations: Invitation[];
  ready: boolean;
  error: UiError | null;
  load: (spaceId: string) => Promise<void>;
  /** Le jeton n'est rendu qu'ici, une fois : l'écran doit le montrer tout de suite. */
  create: (
    input: InvitationInput
  ) => Promise<{ invitation: Invitation; token: string } | null>;
  revoke: (id: string) => Promise<boolean>;
  accept: (
    token: string,
    participantId?: string | null
  ) => Promise<Accepted | null>;
  clearError: () => void;
}

/**
 * LES INVITATIONS D'UN ESPACE. Sans compte ni base partagée, le port répond
 * `local-mode` à chaque geste — l'écran le dit avant même d'essayer. Le
 * jeton d'un lien n'existe qu'au moment de sa création : la liste ne porte
 * que des empreintes (0007).
 */
export const useInvitations = create<InvitationsState>((set, get) => {
  const attempt = async <T>(
    what: string,
    run: () => Promise<T>
  ): Promise<T | null> => {
    try {
      const result = await run();
      set({ error: null });
      return result;
    } catch (cause) {
      log.error(what, { cause });
      set({ error: toUiError(cause) });
      return null;
    }
  };

  return {
    spaceId: null,
    invitations: [],
    ready: false,
    error: null,

    async load(spaceId) {
      if (get().spaceId !== spaceId) {
        set({ spaceId, invitations: [], ready: false, error: null });
      }
      try {
        const invitations = await backend.invitations.list(spaceId);
        if (get().spaceId !== spaceId) return;
        set({ invitations, ready: true, error: null });
      } catch (cause) {
        log.error('lecture des invitations', { cause });
        set({ ready: true, error: toUiError(cause) });
      }
    },

    async create(input) {
      const issued = await attempt('création d’une invitation', () =>
        backend.invitations.create(input)
      );
      if (issued)
        set({ invitations: [issued.invitation, ...get().invitations] });
      return issued;
    },

    async revoke(id) {
      const done = await attempt('révocation d’une invitation', () =>
        backend.invitations.revoke(id)
      );
      if (done === null) return false;
      const spaceId = get().spaceId;
      if (spaceId) await get().load(spaceId);
      return true;
    },

    async accept(token, participantId) {
      return attempt('acceptation d’une invitation', () =>
        backend.invitations.accept(token, participantId ?? null)
      );
    },

    clearError() {
      set({ error: null });
    },
  };
});

/** Charge les invitations de l'espace au montage, et à chaque changement d'espace. */
export function useInvitationsOf(spaceId: string | undefined): void {
  const load = useInvitations(state => state.load);
  useEffect(() => {
    if (spaceId) void load(spaceId);
  }, [spaceId, load]);
}
