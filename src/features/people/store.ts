import { useEffect } from 'react';
import { create } from 'zustand';
import { createLogger } from '@mister-guiiug/dev-pwa-config/logger';
import { backend } from '../../backend/index.ts';
import type {
  Group,
  GroupInput,
  GroupPatch,
  Participant,
  ParticipantInput,
  ParticipantPatch,
} from '../../backend/ports.ts';
import { reorder } from '../../domain/people.ts';
import { toUiError, type UiError } from '../spaces/store.ts';

const log = createLogger('personnes');

interface PeopleState {
  /** L'espace dont les listes ci-dessous parlent. */
  spaceId: string | null;
  participants: Participant[];
  groups: Group[];
  /** `false` tant que la première lecture de cet espace n'a pas rendu. */
  ready: boolean;
  error: UiError | null;
  load: (spaceId: string) => Promise<void>;
  createParticipant: (input: ParticipantInput) => Promise<Participant | null>;
  updateParticipant: (
    id: string,
    patch: ParticipantPatch,
    expectedVersion: number
  ) => Promise<Participant | null>;
  archiveParticipant: (
    id: string,
    archived: boolean,
    expectedVersion: number
  ) => Promise<Participant | null>;
  moveParticipant: (id: string, direction: 'up' | 'down') => Promise<boolean>;
  linkMe: (participantId: string) => Promise<boolean>;
  unlinkMe: (participantId: string) => Promise<boolean>;
  createGroup: (input: GroupInput) => Promise<Group | null>;
  updateGroup: (
    id: string,
    patch: GroupPatch,
    expectedVersion: number
  ) => Promise<Group | null>;
  archiveGroup: (
    id: string,
    archived: boolean,
    expectedVersion: number
  ) => Promise<Group | null>;
  removeGroup: (id: string) => Promise<boolean>;
  clearError: () => void;
}

/**
 * LES PERSONNES ET LES REGROUPEMENTS D'UN ESPACE — un seul magasin, parce
 * qu'un regroupement ne se lit pas sans ses personnes (le dépliage). Même
 * contrat que le magasin des espaces : l'état vivant ici, le PORT pour ce
 * qui survit, la version attendue sur chaque écriture, l'erreur nommée et
 * rendue plutôt qu'avalée (ADR 0002, 0015).
 */
export const usePeople = create<PeopleState>((set, get) => {
  /** Un geste qui peut échouer : son résultat, ou `null` et l'erreur posée. */
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
  const replaceParticipant = (participant: Participant) =>
    set({
      participants: get().participants.map(p =>
        p.id === participant.id ? participant : p
      ),
    });
  const replaceGroup = (group: Group) =>
    set({ groups: get().groups.map(g => (g.id === group.id ? group : g)) });
  /** Relire l'espace courant — après un geste qui touche plusieurs lignes. */
  const reload = async () => {
    const spaceId = get().spaceId;
    if (spaceId) await get().load(spaceId);
  };

  return {
    spaceId: null,
    participants: [],
    groups: [],
    ready: false,
    error: null,

    async load(spaceId) {
      if (get().spaceId !== spaceId) {
        set({
          spaceId,
          participants: [],
          groups: [],
          ready: false,
          error: null,
        });
      }
      try {
        const [participants, groups] = await Promise.all([
          backend.participants.list(spaceId),
          backend.groups.list(spaceId),
        ]);
        // Une autre navigation est passée pendant la lecture : elle a la main.
        if (get().spaceId !== spaceId) return;
        set({ participants, groups, ready: true, error: null });
      } catch (cause) {
        log.error('lecture des personnes', { cause });
        set({ ready: true, error: toUiError(cause) });
      }
    },

    async createParticipant(input) {
      const participant = await attempt('création d’une personne', () =>
        backend.participants.create(input)
      );
      if (participant)
        set({ participants: [...get().participants, participant] });
      return participant;
    },

    async updateParticipant(id, patch, expectedVersion) {
      const participant = await attempt('mise à jour d’une personne', () =>
        backend.participants.update(id, patch, expectedVersion)
      );
      if (participant) replaceParticipant(participant);
      return participant;
    },

    async archiveParticipant(id, archived, expectedVersion) {
      const participant = await attempt('archivage d’une personne', () =>
        backend.participants.archive(id, archived, expectedVersion)
      );
      if (participant) replaceParticipant(participant);
      return participant;
    },

    // L'ordre se réécrit ligne par ligne, chacune avec sa version ; puis on
    // relit, parce que positions et versions ont bougé sur plusieurs lignes.
    async moveParticipant(id, direction) {
      const writes = reorder(
        get().participants.filter(p => !p.archivedAt),
        id,
        direction
      );
      if (writes.length === 0) return true;
      const done = await attempt('déplacement d’une personne', async () => {
        for (const { item, position } of writes) {
          await backend.participants.update(
            item.id,
            { position },
            item.version
          );
        }
        return true;
      });
      await reload();
      return done === true;
    },

    async linkMe(participantId) {
      const done = await attempt('rattachement à une personne', () =>
        backend.participants.link(participantId)
      );
      await reload();
      return done !== null;
    },

    async unlinkMe(participantId) {
      const done = await attempt('détachement d’une personne', () =>
        backend.participants.unlink(participantId)
      );
      await reload();
      return done !== null;
    },

    async createGroup(input) {
      const group = await attempt('création d’un regroupement', () =>
        backend.groups.create(input)
      );
      if (group) set({ groups: [...get().groups, group] });
      return group;
    },

    async updateGroup(id, patch, expectedVersion) {
      const group = await attempt('mise à jour d’un regroupement', () =>
        backend.groups.update(id, patch, expectedVersion)
      );
      if (group) replaceGroup(group);
      return group;
    },

    async archiveGroup(id, archived, expectedVersion) {
      const group = await attempt('archivage d’un regroupement', () =>
        backend.groups.archive(id, archived, expectedVersion)
      );
      if (group) replaceGroup(group);
      return group;
    },

    // Retiré de la liste tout de suite, remis si la base refuse — supprimer
    // un regroupement ne touche ni les personnes ni les dépenses (R15).
    async removeGroup(id) {
      const before = get().groups;
      set({ groups: before.filter(g => g.id !== id) });
      const done = await attempt('suppression d’un regroupement', () =>
        backend.groups.remove(id)
      );
      if (done === null) set({ groups: before });
      return done !== null;
    },

    clearError() {
      set({ error: null });
    },
  };
});

/**
 * Charge les personnes et regroupements de l'espace au montage de l'écran,
 * et à chaque changement d'espace. Relire à chaque montage est voulu : c'est
 * bon marché, et l'écran repart toujours de ce qui est écrit.
 */
export function usePeopleOf(spaceId: string | undefined): void {
  const load = usePeople(state => state.load);
  useEffect(() => {
    if (spaceId) void load(spaceId);
  }, [spaceId, load]);
}
