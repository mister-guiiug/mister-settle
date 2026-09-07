import { createVersionedStore } from '@mister-guiiug/dev-pwa-config/versioned-store';
import type { Backend, NotesSnapshot } from './ports.ts';
import { notesStoreOptions } from './notes-file.ts';

/**
 * L'adaptateur local : `versioned-store` du socle, pas `localStorage` nu.
 *
 * La différence tient en une garantie : ce magasin enveloppe la donnée dans
 * `{ v, data }`, applique une chaîne de migrations qui montent d'un cran, et
 * **copie de côté avant toute perte possible** — donnée illisible, version
 * venue du futur, schéma refusé. Sept apps du parc avaient chacune leur
 * `storage.ts` maison ; aucune n'avait cette copie de sauvegarde, et c'est
 * exactement ce qui manque le jour où un utilisateur ouvre une version
 * antérieure de l'app.
 *
 * `validate` reçoit le schéma zod de l'application : le socle ne dépend
 * d'aucun validateur, il appelle celui qu'on lui donne. Version, migrations et
 * validation viennent de `notes-file.ts`, partagé avec l'adaptateur distant :
 * les deux relisent les mêmes fichiers exportés.
 */
export const notesStore = createVersionedStore<NotesSnapshot>({
  store: 'mister-settle',
  ...notesStoreOptions,
});

/**
 * Le magasin versionné est synchrone ; le port ne l'est pas. L'adaptateur
 * local se contente donc d'envelopper — il ne gagne rien à l'être, mais le
 * port doit rester implémentable par un adaptateur distant, et c'est lui qui
 * commande.
 */
export function createLocalBackend(): Backend {
  return {
    notes: {
      load: async () => notesStore.load(),
      // Le local ne sait pas toucher une ligne : il relit, modifie, réécrit.
      // C'est le distant qui a besoin de mutations, et c'est lui qui commande
      // la forme du port.
      add: async note => {
        const { notes } = notesStore.load();
        notesStore.save({ notes: [note, ...notes] });
      },
      remove: async id => {
        const { notes } = notesStore.load();
        notesStore.save({ notes: notes.filter(n => n.id !== id) });
      },
      clear: async () => {
        notesStore.clear();
      },
      export: async () => notesStore.export(),
      // `versioned-store.import()` : le JSON passe par `validate` — le schéma
      // zod — avant d'être écrit. Un fichier d'une autre app, ou tronqué, est
      // refusé sans rien effacer.
      import: async json => notesStore.import(json),
    },
  };
}
