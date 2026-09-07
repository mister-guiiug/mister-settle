import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createQueuedNotes } from './queued-notes.ts';
import type { Note, NotesRepository, NotesSnapshot } from './ports.ts';

/**
 * Ce que ces tests figent, c'est la PROMESSE d'une file d'écritures hors
 * ligne : rien n'est perdu quand le réseau tombe, rien ne boucle quand la base
 * refuse, et l'écran peut le dire dans les deux cas.
 *
 * Ils tournent contre un dépôt de comptoir plutôt que contre l'adaptateur
 * Supabase, et c'est le but : la file ne sait pas vers quoi elle rejoue. Ce
 * qui est vérifié ici est vrai du prochain adaptateur.
 */

const note = (id: string, text = id): Note => ({
  id,
  text,
  createdAt: '2026-09-06T00:00:00.000Z',
});

/** Un port de comptoir : il enregistre ce qu'on lui demande, et sait refuser. */
function depotFactice() {
  const ecrites: Note[] = [];
  const retirees: string[] = [];
  let refus: Error | null = null;
  return {
    ecrites,
    retirees,
    refuser(erreur: Error | null) {
      refus = erreur;
    },
    repository: {
      load: async (): Promise<NotesSnapshot> => ({ notes: [...ecrites] }),
      add: async (n: Note) => {
        if (refus) throw refus;
        ecrites.push(n);
      },
      remove: async (id: string) => {
        if (refus) throw refus;
        retirees.push(id);
      },
      clear: async () => {
        ecrites.length = 0;
      },
      export: async () => null,
      import: async (): Promise<NotesSnapshot> => ({ notes: [] }),
    } satisfies NotesRepository,
  };
}

/**
 * Le rejeu automatique est NEUTRALISÉ dans ces tests : la file du socle
 * reprogramme un drain en retrait exponentiel après un échec transitoire, et
 * c'est le socle qui le prouve. Ici on veut décider nous-mêmes du moment de
 * chaque drain — sinon une minuterie réelle rejouerait pendant le test suivant.
 */
const sansRejeuAutomatique = {
  setTimeout: (() => 0) as unknown as typeof setTimeout,
  clearTimeout: (() => {}) as unknown as typeof clearTimeout,
};

function fileSur(
  depot: NotesRepository,
  enLigne: () => boolean,
  prefix = 'test-sync-'
) {
  return createQueuedNotes(depot, {
    prefix,
    isOnline: enLigne,
    // Aucun écouteur réseau : ces tests pilotent le drain à la main.
    env: {},
    ...sansRejeuAutomatique,
  });
}

beforeEach(() => {
  localStorage.clear();
});

describe('la file d’écritures hors ligne', () => {
  it('retient une note écrite hors ligne, et l’envoie au retour du réseau', async () => {
    const depot = depotFactice();
    let enLigne = false;
    const file = fileSur(depot.repository, () => enLigne);

    // LA PROMESSE DU PORT VEUT DIRE « ACCEPTÉ », PAS « ÉCRIT ». Sans ce
    // changement, le magasin restaurerait l'état d'avant une seconde après le
    // geste — exactement ce qu'on cherche à éviter.
    await file.notes.add(note('note_1'));

    expect(depot.ecrites).toHaveLength(0);
    expect(file.queue.pending()).toBe(1);
    expect(file.getSnapshot().status).toBe('offline');

    enLigne = true;
    await file.queue.flush();

    expect(depot.ecrites.map(n => n.id)).toEqual(['note_1']);
    expect(file.getSnapshot()).toMatchObject({ status: 'synced', pending: 0 });
  });

  it('survit à un rechargement : la file est sur le disque, pas en mémoire', async () => {
    const depot = depotFactice();
    let enLigne = false;

    const avant = fileSur(depot.repository, () => enLigne);
    await avant.notes.add(note('note_perdue_ailleurs'));
    avant.stop();

    // Le rechargement : plus rien en mémoire, une instance neuve sur le même
    // préfixe. C'est le seul scénario qui distingue une vraie file d'un
    // tableau qui vit dans une fermeture.
    const apres = fileSur(depot.repository, () => enLigne);
    expect(apres.queue.pending()).toBe(1);

    enLigne = true;
    await apres.queue.flush();
    expect(depot.ecrites.map(n => n.id)).toEqual(['note_perdue_ailleurs']);
  });

  it('ne rejoue PAS une écriture refusée par la RLS : lettre morte, et elle le dit', async () => {
    const depot = depotFactice();
    const file = fileSur(depot.repository, () => true);
    depot.refuser(
      new Error('new row violates row-level security policy for table "notes"')
    );

    await file.notes.add(note('note_refusee'));
    await file.drained();

    // Une file qui boucle sur un refus ne se répare jamais toute seule, et
    // personne ne le voit. Un seul essai, puis de côté.
    expect(file.queue.pending()).toBe(0);
    expect(file.queue.deadLetters()).toHaveLength(1);
    expect(file.getSnapshot()).toMatchObject({ status: 'error', dead: 1 });
    expect(file.getSnapshot().lastError).toMatch(/row-level security/);

    // ET LA FILE CONTINUE : une tête bloquante emporterait tout ce qui suit.
    depot.refuser(null);
    await file.notes.add(note('note_suivante'));
    await file.drained();
    expect(depot.ecrites.map(n => n.id)).toEqual(['note_suivante']);
  });

  it('rejoue en revanche un échec de réseau, sans consommer la note', async () => {
    const depot = depotFactice();
    const file = fileSur(depot.repository, () => true);
    depot.refuser(new TypeError('Failed to fetch'));

    await file.notes.add(note('note_1'));
    // Le drain part tout seul derrière `add` : on l'OBSERVE au lieu de le
    // relancer. Le socle rend `{0,0,0}` à un second drain concurrent — un
    // test qui le relancerait serait vert par hasard, pas par observation.
    await file.drained();

    expect(file.queue.pending()).toBe(1);
    expect(file.queue.list()[0]?.attempts).toBe(1);
    expect(file.queue.deadLetters()).toHaveLength(0);

    depot.refuser(null);
    expect(await file.queue.flush()).toMatchObject({ done: 1 });
    expect(depot.ecrites.map(n => n.id)).toEqual(['note_1']);
  });

  it('ajoutée puis retirée hors ligne, une seule opération part', async () => {
    const depot = depotFactice();
    let enLigne = false;
    const file = fileSur(depot.repository, () => enLigne);

    await file.notes.add(note('note_ephemere'));
    await file.notes.remove('note_ephemere');

    // Deux entrées auraient envoyé une insertion qu'on s'apprête à défaire.
    expect(file.queue.pending()).toBe(1);

    enLigne = true;
    await file.queue.flush();
    expect(depot.ecrites).toHaveLength(0);
    // La suppression d'une ligne que le serveur n'a jamais vue ne touche rien.
    expect(depot.retirees).toEqual(['note_ephemere']);
  });

  it('ne met PAS en file ce qui remplace tout — import et effacement', async () => {
    const depot = depotFactice();
    const importe = vi.spyOn(depot.repository, 'import');
    const efface = vi.spyOn(depot.repository, 'clear');
    const file = fileSur(depot.repository, () => true);

    // Rejouer « efface tout » une heure plus tard emporterait ce qui a été
    // écrit entre-temps, ici ou sur un autre appareil.
    await file.notes.import('{"v":1,"data":{"notes":[]}}');
    await file.notes.clear();

    expect(importe).toHaveBeenCalledTimes(1);
    expect(efface).toHaveBeenCalledTimes(1);
    expect(file.queue.pending()).toBe(0);
  });

  it('rendues à la file, les lettres mortes repartent — et l’écran redevient calme', async () => {
    const depot = depotFactice();
    const file = fileSur(depot.repository, () => true);
    depot.refuser(new Error('permission denied for table notes'));

    await file.notes.add(note('note_1'));
    await file.drained();
    expect(file.getSnapshot().dead).toBe(1);

    // Ce que propose le bandeau : réessayer. Le refus était passager (session
    // expirée, rôle posé depuis) — il n'y a alors rien à jeter.
    depot.refuser(null);
    expect(file.queue.requeueDead()).toBe(1);
    await file.queue.flush();

    expect(depot.ecrites.map(n => n.id)).toEqual(['note_1']);
    expect(file.getSnapshot()).toMatchObject({ status: 'synced', dead: 0 });
  });
});
