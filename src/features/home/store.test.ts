import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UNDO_MS, useNotes } from './store.ts';
import { notesStore } from '../../backend/local.ts';
import { backend } from '../../backend/index.ts';

/**
 * Ce que ces tests figent, c'est le CONTRAT : ce qui est ajouté se relit après
 * un rechargement, ce qui est vide est refusé, et une écriture qui échoue
 * REND L'ÉTAT D'AVANT au lieu de laisser l'écran mentir.
 *
 * Le chemin complet est éprouvé sans rien simuler — magasin d'écran, port,
 * magasin versionné, validation zod. C'est possible parce que le backend a un
 * repli local : un test n'a besoin d'aucune configuration.
 */
describe('le magasin de notes', () => {
  beforeEach(async () => {
    localStorage.clear();
    notesStore.clear();
    useNotes.setState({ notes: [], ready: false, error: null, pending: null });
  });

  // Une minuterie de sursis armée par un test ne doit pas se déclencher
  // pendant le suivant : `commitRemove` ne ferait rien (il vérifie que le
  // sursis est bien le sien), mais l'horloge simulée, elle, resterait.
  afterEach(() => {
    vi.useRealTimers();
  });

  it('ajoute une note, la plus récente en tête', async () => {
    await useNotes.getState().add('première');
    await useNotes.getState().add('seconde');

    expect(useNotes.getState().notes.map(n => n.text)).toEqual([
      'seconde',
      'première',
    ]);
  });

  it('refuse une note vide ou faite d’espaces', async () => {
    await useNotes.getState().add('   ');
    await useNotes.getState().add('');

    expect(useNotes.getState().notes).toHaveLength(0);
  });

  it('rend la note relisible après un rechargement', async () => {
    await useNotes.getState().add('ce qui survit');

    // Ce que verrait un démarrage à froid : l'état est vidé, puis rechargé
    // depuis le port, comme au montage de l'application.
    useNotes.setState({ notes: [], ready: false });
    await useNotes.getState().load();

    expect(useNotes.getState().notes.map(n => n.text)).toEqual([
      'ce qui survit',
    ]);
    expect(useNotes.getState().ready).toBe(true);
  });

  it('retire la note demandée, et elle seule — mais seulement après le sursis', async () => {
    vi.useFakeTimers();
    await useNotes.getState().add('à garder');
    await useNotes.getState().add('à retirer');
    const cible = useNotes.getState().notes[0];
    expect(cible).toBeDefined();

    useNotes.getState().remove(cible!.id);

    // L'écran a perdu la note tout de suite — c'est ce qui rend le geste
    // lisible : on VOIT le résultat avant d'avoir à se décider.
    expect(useNotes.getState().notes.map(n => n.text)).toEqual(['à garder']);
    // La base, elle, ne sait encore rien. C'est tout l'objet du sursis.
    expect((await backend.notes.load()).notes).toHaveLength(2);

    await vi.advanceTimersByTimeAsync(UNDO_MS);

    expect((await backend.notes.load()).notes.map(n => n.text)).toEqual([
      'à garder',
    ]);
    expect(useNotes.getState().pending).toBeNull();
  });

  it('annulée, la note revient À SA PLACE et rien n’a été écrit', async () => {
    vi.useFakeTimers();
    const efface = vi.spyOn(backend.notes, 'remove');
    await useNotes.getState().add('première');
    await useNotes.getState().add('deuxième');
    await useNotes.getState().add('troisième');
    // La plus récente en tête : [troisième, deuxième, première].
    const milieu = useNotes.getState().notes[1]!;

    useNotes.getState().remove(milieu.id);
    expect(useNotes.getState().notes.map(n => n.text)).toEqual([
      'troisième',
      'première',
    ]);

    useNotes.getState().undoRemove(milieu.id);

    // AU MILIEU, pas en tête : une annulation qui remet la note ailleurs
    // qu'où elle était n'annule pas, elle déplace.
    expect(useNotes.getState().notes.map(n => n.text)).toEqual([
      'troisième',
      'deuxième',
      'première',
    ]);

    // Et le sursis désarmé n'écrit rien, même longtemps après.
    await vi.advanceTimersByTimeAsync(UNDO_MS * 3);
    expect(efface).not.toHaveBeenCalled();
    expect((await backend.notes.load()).notes).toHaveLength(3);
    efface.mockRestore();
  });

  it('une seconde suppression SOLDE la première au lieu de l’oublier', async () => {
    // Le défaut que cette règle évite : un sursis abandonné ne serait jamais
    // écrit. L'écran aurait perdu la note, la base l'aurait gardée, et elle
    // réapparaîtrait au prochain chargement sans explication.
    vi.useFakeTimers();
    await useNotes.getState().add('une');
    await useNotes.getState().add('deux');
    const [deux, une] = useNotes.getState().notes;

    useNotes.getState().remove(deux!.id);
    useNotes.getState().remove(une!.id);
    await vi.advanceTimersByTimeAsync(0);

    expect((await backend.notes.load()).notes.map(n => n.text)).toEqual([
      'une',
    ]);

    // Seul le DERNIER geste reste annulable — celui qu'on regrette.
    useNotes.getState().undoRemove(une!.id);
    expect(useNotes.getState().notes.map(n => n.text)).toEqual(['une']);
  });

  it('quitter l’écran solde le sursis, il n’en reste aucun en suspens', async () => {
    await useNotes.getState().add('partie');
    const cible = useNotes.getState().notes[0]!;

    useNotes.getState().remove(cible.id);
    await useNotes.getState().flushRemovals();

    expect(useNotes.getState().pending).toBeNull();
    expect((await backend.notes.load()).notes).toEqual([]);
  });

  it('rend la note à SA PLACE quand la suppression est refusée', async () => {
    await useNotes.getState().add('première');
    await useNotes.getState().add('deuxième');
    const derniere = useNotes.getState().notes[1]!;
    const echec = vi
      .spyOn(backend.notes, 'remove')
      .mockRejectedValueOnce(new Error('refus de la base'));

    useNotes.getState().remove(derniere.id);
    await useNotes.getState().flushRemovals();

    expect(useNotes.getState().notes.map(n => n.text)).toEqual([
      'deuxième',
      'première',
    ]);
    expect(useNotes.getState().error).toBe('refus de la base');
    echec.mockRestore();
  });

  it('efface tout, magasin compris', async () => {
    await useNotes.getState().add('éphémère');
    await useNotes.getState().clear();

    expect(useNotes.getState().notes).toEqual([]);
    expect((await backend.notes.load()).notes).toEqual([]);
  });

  it('restaure l’état d’avant quand l’écriture échoue', async () => {
    await useNotes.getState().add('déjà là');
    const avant = useNotes.getState().notes;

    // Une écriture distante peut échouer — réseau, RLS, session expirée. Ce
    // que l'écran ne doit JAMAIS faire, c'est afficher une note que la base
    // n'a pas acceptée.
    const echec = vi
      .spyOn(backend.notes, 'add')
      .mockRejectedValueOnce(new Error('refus de la base'));

    await useNotes.getState().add('jamais écrite');

    expect(useNotes.getState().notes).toEqual(avant);
    expect(useNotes.getState().error).toBe('refus de la base');
    echec.mockRestore();
  });

  it('parle au port en mutations : une note ajoutée, une note retirée', async () => {
    // Le contrat que le distant attend : `add` reçoit LA note, `remove`
    // l'identifiant — jamais la liste entière. Le premier adaptateur Supabase
    // effaçait tout et réinsérait à chaque geste.
    const add = vi.spyOn(backend.notes, 'add');
    const remove = vi.spyOn(backend.notes, 'remove');

    await useNotes.getState().add('une');
    const [ajoutee] = useNotes.getState().notes;
    expect(add).toHaveBeenCalledWith(
      expect.objectContaining({ id: ajoutee!.id, text: 'une' })
    );

    useNotes.getState().remove(ajoutee!.id);
    await useNotes.getState().flushRemovals();
    expect(remove).toHaveBeenCalledWith(ajoutee!.id);

    add.mockRestore();
    remove.mockRestore();
  });

  it('importe ce qu’il a exporté : le fichier remplace tout, et survit au rechargement', async () => {
    // Le format du fichier est celui du magasin versionné (`{ v, data }`) :
    // ce que `export` écrit, `import` le relit — sur l'autre appareil, et sur
    // l'autre backend.
    await useNotes.getState().add('elle aussi');
    await useNotes.getState().add('venue du fichier');
    const fichier = await backend.notes.export();
    expect(fichier).toContain('"v": 1');

    await useNotes.getState().clear();
    await useNotes.getState().add('avant l’import');

    expect(await useNotes.getState().importJson(fichier!)).toBe(2);
    expect(useNotes.getState().notes.map(n => n.text)).toEqual([
      'venue du fichier',
      'elle aussi',
    ]);

    useNotes.setState({ notes: [], ready: false });
    await useNotes.getState().load();
    expect(useNotes.getState().notes.map(n => n.text)).toEqual([
      'venue du fichier',
      'elle aussi',
    ]);
  });

  it('refuse un fichier illisible ou d’une autre forme, sans rien effacer', async () => {
    await useNotes.getState().add('intacte');
    const avant = useNotes.getState().notes;

    expect(await useNotes.getState().importJson('{ pas du json')).toBeNull();
    expect(useNotes.getState().error).not.toBeNull();
    expect(useNotes.getState().notes).toEqual(avant);

    // Du JSON valide, versionné, mais pas des notes : le schéma refuse.
    expect(
      await useNotes
        .getState()
        .importJson(JSON.stringify({ v: 1, data: { taches: [] } }))
    ).toBeNull();
    expect(useNotes.getState().notes).toEqual(avant);
    expect((await backend.notes.load()).notes).toEqual(avant);
  });
});
