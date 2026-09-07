import { createVersionedStore } from '@mister-guiiug/dev-pwa-config/versioned-store';
import type { Store } from '@mister-guiiug/dev-pwa-config/storage';
import { notesSchema, type NotesSnapshot } from './ports.ts';

/**
 * LE FORMAT DU FICHIER — ce que `export` écrit et ce que `import` accepte —
 * est celui du magasin versionné du socle : `{ v, data }`. Un adaptateur n'a
 * pas à inventer le sien : le numéro de version est ce qui permet, le jour où
 * le modèle change, de relire un fichier exporté avant le changement.
 *
 * La définition du schéma vit ICI, en un seul endroit : version, migrations,
 * validation. L'adaptateur local la donne à son magasin sur `localStorage` ;
 * l'adaptateur distant la donne à un magasin EN MÉMOIRE, le temps de valider
 * et de migrer un fichier — les deux relisent donc exactement les mêmes
 * exports, et un fichier d'une autre application est refusé par le schéma,
 * avant que quoi que ce soit ne soit effacé.
 */
export const notesStoreOptions = {
  key: 'notes',
  version: 1,
  validate: (data: unknown) => notesSchema.parse(data),
  seed: (): NotesSnapshot => ({ notes: [] }),
  // Aucune migration pour l'instant : la version 1 est la première. Le jour où
  // le modèle change, `migrations[1]` transforme la donnée de la v1 vers la v2
  // — et le magasin, lui, tient le compte.
  migrations: {} as Record<number, (data: unknown) => unknown>,
};

/**
 * Un magasin jetable, en mémoire, qui honore tout le contrat `Store` du
 * socle : le magasin versionné n'en appelle que trois membres, mais un objet
 * partiel déguisé en `Store` casserait le jour où il en appelle un quatrième.
 * `kind: 'session'` est le plus proche de la vérité — rien ne survit.
 */
function memoryStore(): Store {
  const values = new Map<string, string>();
  return {
    prefix: 'notes-file',
    kind: 'session',
    available: () => true,
    get: <T>(key: string, fallback: T): T => {
      const raw = values.get(key);
      if (raw === undefined) return fallback;
      try {
        return JSON.parse(raw) as T;
      } catch {
        return fallback;
      }
    },
    set: (key, value) => {
      values.set(key, JSON.stringify(value));
      return true;
    },
    getRaw: key => values.get(key) ?? null,
    setRaw: (key, value) => {
      values.set(key, value);
      return true;
    },
    remove: key => {
      values.delete(key);
    },
    keys: () => [...values.keys()],
    clear: () => values.clear(),
  };
}

/** Valide et migre un fichier exporté ; lève sur un fichier illisible ou d'une autre forme. */
export function parseNotesFile(json: string): NotesSnapshot {
  return createVersionedStore<NotesSnapshot>({
    store: memoryStore(),
    ...notesStoreOptions,
  }).import(json);
}

/** Le fichier qu'un import saura relire, versionné comme le magasin local. */
export function stringifyNotesFile(snapshot: NotesSnapshot): string {
  const store = createVersionedStore<NotesSnapshot>({
    store: memoryStore(),
    ...notesStoreOptions,
  });
  store.save(snapshot);
  return (
    store.export() ??
    JSON.stringify({ v: notesStoreOptions.version, data: snapshot })
  );
}
