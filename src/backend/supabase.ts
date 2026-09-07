import { createSupabaseClientFactory } from '@mister-guiiug/dev-pwa-config/supabase-client';
import { createLogger } from '@mister-guiiug/dev-pwa-config/logger';
import { notesSchema, type Backend, type Note } from './ports.ts';
import { parseNotesFile, stringifyNotesFile } from './notes-file.ts';

const log = createLogger('supabase');

/**
 * LA FABRIQUE DU SOCLE, PAS UN `createClient` EN HAUT DE FICHIER.
 *
 * Elle est **paresseuse** : `@supabase/supabase-js` n'est chargé qu'au premier
 * appel réel. Une application configurée mais dont personne n'ouvre le compte
 * ne paie donc pas les cinquante kilo-octets du SDK au premier rendu — c'est
 * ce que faisait une app du parc, qui préchargeait Supabase avant même l'écran
 * d'accueil.
 *
 * Elle sait aussi dire ce qui manque (`missing()`) plutôt que d'échouer sur un
 * `undefined`, et c'est ce que l'écran de réglages affiche.
 */
export const supabase = createSupabaseClientFactory<SupabaseLike>({
  // `flowType: 'pkce'` N'EST PAS UN RÉGLAGE DE SÉCURITÉ ICI, C'EST UNE
  // NÉCESSITÉ DE ROUTAGE. La connexion par lien renvoie, en flux implicite,
  // le jeton dans le FRAGMENT (`#access_token=…`) — l'endroit exact où un
  // `HashRouter` lit la route : il y verrait une adresse inconnue, la
  // remplacerait par « / », et le jeton disparaîtrait avant d'avoir servi.
  // PKCE renvoie `?code=…` dans la query, que le routeur ne touche pas. Ce
  // squelette route par chemin (ADR 0001) et n'en souffrirait pas ; il le
  // pose quand même, parce que neuf applications de la famille routent par
  // `#` et que ce fichier part chez elles. Mister-miss-koh l'a payé.
  auth: { flowType: 'pkce' },
});

/** Le strict nécessaire du client, pour ne pas figer une version du SDK. */
export interface SupabaseLike {
  auth: {
    getUser(): Promise<{ data: { user: { id: string } | null } }>;
    /**
     * `scope` EST OBLIGATOIRE ICI, et c'est tout l'intérêt de le déclarer.
     * Une déconnexion « globale » demande au serveur de révoquer les jetons —
     * ce qu'il refuse quand le compte vient d'être effacé, puisque
     * l'utilisateur n'existe plus. `'local'` efface la session sur l'appareil
     * sans rien demander à personne : c'est la seule qui puisse suivre une
     * suppression de compte.
     */
    signOut(options: { scope: 'local' | 'global' }): Promise<{
      error: { message: string } | null;
    }>;
  };
  /** Appel d'une fonction Postgres exposée par PostgREST (`security definer`). */
  rpc(
    fn: string,
    args?: Record<string, unknown>
  ): Promise<{ error: { message: string } | null }>;
  from(table: string): {
    select(columns: string): {
      order(
        column: string,
        options: { ascending: boolean }
      ): Promise<{ data: unknown[] | null; error: { message: string } | null }>;
    };
    delete(): {
      eq(
        column: string,
        value: string
      ): Promise<{ error: { message: string } | null }>;
    };
    insert(rows: unknown[]): Promise<{ error: { message: string } | null }>;
  };
}

/**
 * L'adaptateur des notes. Il ne remplace QUE ce port : tout le reste du
 * backend continue de venir du repli local, et c'est ce que
 * `createBackendSelector` compose.
 *
 * LA RLS FAIT LE FILTRAGE, PAS CE CODE. Aucune requête ne porte de
 * `where user_id = …` : les politiques de `0003_rls.sql` restreignent déjà les
 * lignes au propriétaire. Filtrer ici en plus donnerait l'illusion que la
 * sécurité vient du client — elle vient de la base, et elle doit rester
 * vérifiable sans lire le front.
 */
export function createSupabaseNotes(): Backend['notes'] {
  const client = () => supabase.getClient();

  return {
    async load() {
      const db = await client();
      const { data, error } = await db
        .from('notes')
        .select('id, text, created_at')
        .order('created_at', { ascending: false });

      if (error) {
        // Remonter l'erreur plutôt que rendre une liste vide : une lecture qui
        // échoue et une liste réellement vide ne se traitent pas pareil.
        log.error('lecture des notes', { message: error.message });
        throw new Error(error.message);
      }

      // Validé comme le local : ce qui vient du réseau n'est pas plus sûr que
      // ce qui vient du disque.
      return notesSchema.parse({
        notes: (data ?? []).map(row => {
          const r = row as { id: string; text: string; created_at: string };
          return { id: r.id, text: r.text, createdAt: r.created_at };
        }),
      });
    },

    /**
     * UNE LIGNE PAR GESTE. La première version de cet adaptateur n'avait que
     * `save(snapshot)` : elle effaçait toutes les lignes de l'utilisateur et
     * réinsérait la liste entière à chaque note ajoutée — deux requêtes, une
     * fenêtre sans aucune note entre les deux, et un coût qui grandissait avec
     * la liste. Son commentaire annonçait la limite ; la voici franchie dans
     * le bon sens.
     */
    async add(note: Note) {
      const db = await client();
      const {
        data: { user },
      } = await db.auth.getUser();
      if (!user) throw new Error('écriture sans session');
      const { error } = await db.from('notes').insert([
        {
          id: note.id,
          user_id: user.id,
          text: note.text,
          created_at: note.createdAt,
        },
      ]);
      if (error) throw new Error(error.message);
    },

    async remove(id: string) {
      const db = await client();
      // Pas de `user_id` ici non plus : `notes_delete_own` ne laisse passer
      // que les lignes du propriétaire, et une autre ligne portant cet
      // identifiant ne serait simplement pas touchée.
      const { error } = await db.from('notes').delete().eq('id', id);
      if (error) throw new Error(error.message);
    },

    async clear() {
      const db = await client();
      const {
        data: { user },
      } = await db.auth.getUser();
      if (!user) return;
      const { error } = await db.from('notes').delete().eq('user_id', user.id);
      if (error) throw new Error(error.message);
    },

    // Le même fichier que le local : `{ v, data }`, pour qu'un export d'un
    // appareil se relise sur l'autre quel que soit le backend derrière.
    async export() {
      return stringifyNotesFile(await this.load());
    },

    /**
     * Le SEUL chemin qui remplace tout : un fichier exporté, validé et migré
     * par la même chaîne que le local (`notes-file.ts`), puis les lignes de
     * l'utilisateur effacées et réinsérées. C'est l'ancien `save`, réservé au
     * geste qui le mérite — et validé AVANT d'effacer quoi que ce soit.
     */
    async import(json: string) {
      const snapshot = parseNotesFile(json);
      const db = await client();
      const {
        data: { user },
      } = await db.auth.getUser();
      if (!user) throw new Error('écriture sans session');

      const { error: cleared } = await db
        .from('notes')
        .delete()
        .eq('user_id', user.id);
      if (cleared) throw new Error(cleared.message);

      if (snapshot.notes.length > 0) {
        const { error } = await db.from('notes').insert(
          snapshot.notes.map(note => ({
            id: note.id,
            user_id: user.id,
            text: note.text,
            created_at: note.createdAt,
          }))
        );
        if (error) throw new Error(error.message);
      }
      return snapshot;
    },
  };
}
