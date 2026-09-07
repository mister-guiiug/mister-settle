import { create } from 'zustand';
import { createId } from '@mister-guiiug/dev-pwa-config/id';
import { createLogger } from '@mister-guiiug/dev-pwa-config/logger';
import { backend } from '../../backend/index.ts';
import type { Note } from '../../backend/ports.ts';

const log = createLogger('notes');

/**
 * Le SURSIS d'une suppression, en millisecondes.
 *
 * Huit secondes : le temps de lire « Note supprimée », de comprendre que ce
 * n'est pas ce qu'on voulait, et d'atteindre « Annuler » — y compris au
 * clavier, où le bouton vit en fin d'ordre de tabulation.
 */
export const UNDO_MS = 8_000;

/** Une suppression en sursis : retirée de l'écran, pas encore de la base. */
export interface PendingRemoval {
  note: Note;
  /** Sa place dans la liste, pour la remettre EXACTEMENT où elle était. */
  index: number;
}

interface NotesState {
  notes: Note[];
  /** `false` tant que la première lecture n'a pas rendu. */
  ready: boolean;
  /** La dernière écriture a échoué : l'écran doit pouvoir le dire. */
  error: string | null;
  /**
   * La suppression en sursis — UNE SEULE À LA FOIS. Deux sursis simultanés
   * poseraient un problème que ce squelette n'a pas à trancher pour toutes
   * ses filles : deux notes remises « à leur place » dans le désordre
   * n'atterrissent pas où elles étaient. Une seconde suppression SOLDE la
   * précédente au lieu de l'empiler ; c'est ce que fait la boîte de réception
   * de tout le monde, et l'annulation reste vraie pour le dernier geste —
   * celui qu'on regrette.
   */
  pending: PendingRemoval | null;
  load: () => Promise<void>;
  add: (text: string) => Promise<void>;
  /**
   * LE GESTE : la note quitte l'écran, la base n'en sait encore rien. Rien
   * n'est écrit avant `UNDO_MS`, ou avant que le sursis ne soit soldé.
   */
  remove: (id: string) => void;
  /** Remet la note à sa place. Rien n'avait été écrit : il n'y a rien à défaire. */
  undoRemove: (id: string) => void;
  /** Solde le sursis : écrit la suppression pour de bon. */
  commitRemove: (id: string) => Promise<void>;
  /** Solde le sursis en cours, s'il y en a un — l'écran s'en va, pas le geste. */
  flushRemovals: () => Promise<void>;
  clear: () => Promise<void>;
  /** Remplace tout par un fichier exporté ; rend le nombre de notes retenues. */
  importJson: (json: string) => Promise<number | null>;
}

/**
 * LA MINUTERIE N'EST PAS DE L'ÉTAT : elle ne se rend pas, elle ne se compare
 * pas, et la mettre dans le magasin ferait un rendu à chaque armement. Elle
 * vit donc ici, au module — un seul sursis à la fois, donc une seule variable.
 *
 * `setTimeout` est résolu À CHAQUE APPEL, pas capturé à l'import : les
 * minuteries simulées d'un test restent effectives même si le magasin a été
 * construit sous l'horloge réelle.
 */
let reprieve: ReturnType<typeof setTimeout> | null = null;

function cancelReprieve() {
  if (reprieve !== null) clearTimeout(reprieve);
  reprieve = null;
}

/**
 * Le magasin d'écran : Zustand pour l'état vivant, le PORT pour ce qui
 * survit. La persistance n'est pas dans le magasin, ce qui rend la migration
 * vers un backend distant possible sans toucher à ce fichier.
 *
 * ÉCRITURE OPTIMISTE, ET REPRISE EN CAS D'ÉCHEC. L'état change d'abord, on
 * écrit ensuite ; si l'écriture échoue, l'état d'AVANT est restauré et
 * l'erreur est portée. Le contraire — attendre le serveur pour afficher —
 * rendrait l'application local-first inutilement lente, puisque son écriture
 * est instantanée.
 *
 * `createId` vient du socle : quatre applications avaient chacune leur
 * générateur, pour environ deux cent cinquante sites d'appel.
 */
async function persist(
  ecriture: () => Promise<void>,
  precedent: Note[],
  set: (partial: Partial<NotesState>) => void
) {
  try {
    await ecriture();
    set({ error: null });
  } catch (cause) {
    log.error('écriture des notes', { cause });
    set({
      notes: precedent,
      error: cause instanceof Error ? cause.message : String(cause),
    });
  }
}

export const useNotes = create<NotesState>((set, get) => ({
  notes: [],
  ready: false,
  error: null,
  pending: null,

  async load() {
    try {
      const snapshot = await backend.notes.load();
      set({ notes: snapshot.notes, ready: true, error: null });
    } catch (cause) {
      log.error('lecture des notes', { cause });
      set({
        ready: true,
        error: cause instanceof Error ? cause.message : String(cause),
      });
    }
  },

  async add(text) {
    const trimmed = text.trim();
    if (!trimmed) return;
    const precedent = get().notes;
    const note: Note = {
      id: createId('note'),
      text: trimmed,
      createdAt: new Date().toISOString(),
    };
    // La plus récente en tête : c'est celle qu'on vient d'écrire.
    set({ notes: [note, ...precedent] });
    // Le port reçoit LA note, pas la liste : le distant insère une ligne.
    await persist(() => backend.notes.add(note), precedent, set);
  },

  /**
   * ANNULER REMPLACE CONFIRMER, IL NE S'Y AJOUTE PAS.
   *
   * L'écran retire la note tout de suite et n'écrit rien : la suppression
   * n'atteint le port qu'après `UNDO_MS`. Un dialogue de confirmation
   * demandait de se décider AVANT, sur une action dont on ne voit pas encore
   * le résultat ; le sursis laisse voir le résultat, puis se dédire.
   */
  remove(id) {
    // Un second geste SOLDE le premier — il ne l'oublie pas. Sans cette
    // ligne, la note d'un sursis abandonné ne serait jamais écrite : l'écran
    // l'aurait perdue et la base l'aurait gardée, jusqu'au prochain
    // chargement qui la ferait réapparaître sans explication.
    const encours = get().pending;
    if (encours) void get().commitRemove(encours.note.id);

    const notes = get().notes;
    const index = notes.findIndex(n => n.id === id);
    if (index < 0) return;
    const note = notes[index]!;

    set({ notes: notes.filter(n => n.id !== id), pending: { note, index } });
    cancelReprieve();
    reprieve = setTimeout(() => void get().commitRemove(id), UNDO_MS);
  },

  undoRemove(id) {
    const encours = get().pending;
    if (!encours || encours.note.id !== id) return;
    cancelReprieve();
    const notes = [...get().notes];
    // `min` : la liste a pu raccourcir entre-temps (un import, un effacement).
    notes.splice(Math.min(encours.index, notes.length), 0, encours.note);
    set({ notes, pending: null });
  },

  async commitRemove(id) {
    const encours = get().pending;
    if (!encours || encours.note.id !== id) return;
    cancelReprieve();
    set({ pending: null });

    // L'état à RENDRE si l'écriture échoue : la liste telle qu'elle serait
    // avec la note remise à sa place. La règle du magasin n'a pas changé —
    // l'écran ne doit jamais montrer une suppression que la base a refusée.
    const precedent = [...get().notes];
    precedent.splice(
      Math.min(encours.index, precedent.length),
      0,
      encours.note
    );
    await persist(() => backend.notes.remove(id), precedent, set);
  },

  async flushRemovals() {
    const encours = get().pending;
    if (encours) await get().commitRemove(encours.note.id);
  },

  /**
   * Pas d'optimisme ici : on ne sait pas ce que le fichier contient avant que
   * le port l'ait validé. L'état ne change qu'avec ce qu'il a retenu ; un
   * fichier refusé laisse les notes intactes et porte l'erreur.
   */
  async importJson(json) {
    // Un import REMPLACE tout : le sursis en cours n'a plus d'objet. On
    // l'ANNULE plutôt que de le solder, pour que la note revienne dans
    // `notes` — c'est cette liste-là qui doit rester intacte si le fichier
    // est refusé.
    if (get().pending) get().undoRemove(get().pending!.note.id);
    try {
      const snapshot = await backend.notes.import(json);
      set({ notes: snapshot.notes, error: null });
      return snapshot.notes.length;
    } catch (cause) {
      log.error('import des notes', { cause });
      set({ error: cause instanceof Error ? cause.message : String(cause) });
      return null;
    }
  },

  async clear() {
    // Même raison que pour l'import : ce qui va tout effacer n'a que faire
    // d'une suppression en sursis, et la note doit être dans `precedent` pour
    // revenir si l'effacement échoue.
    if (get().pending) get().undoRemove(get().pending!.note.id);
    const precedent = get().notes;
    set({ notes: [] });
    try {
      await backend.notes.clear();
      set({ error: null });
    } catch (cause) {
      log.error('effacement des notes', { cause });
      set({
        notes: precedent,
        error: cause instanceof Error ? cause.message : String(cause),
      });
    }
  },
}));
