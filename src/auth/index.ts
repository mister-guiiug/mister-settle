import { supabaseAuthAdapter } from '@mister-guiiug/dev-pwa-config/auth/supabase';
import { useAuthContext } from '@mister-guiiug/dev-pwa-config/react/auth-provider';
import { supabase } from '../backend/supabase.ts';
import { coverage } from '../backend/index.ts';

/**
 * L'ADAPTATEUR, OU RIEN.
 *
 * `AuthProvider` accepte `adapter: null` et se met alors en **mode local** :
 * l'état reste `signed-out` et chaque action rend
 * `{ ok: false, error: { code: 'local-mode' } }`. C'est ce qui permet à
 * l'application de garder ses écrans de compte sans backend, au lieu de les
 * masquer derrière une condition qui finit par diverger.
 *
 * L'adaptateur n'est construit que si le backend distant a été retenu — donc
 * si les deux variables sont présentes. Le construire dans tous les cas
 * chargerait le SDK Supabase pour rien.
 */
let cache: object | null | undefined;

export function authAdapter(): object | null {
  if (cache !== undefined) return cache;
  if (coverage.kind !== 'supabase') {
    cache = null;
    return cache;
  }

  // L'adaptateur du socle veut le client, pas une promesse. On le construit
  // paresseusement autour de la fabrique : le SDK n'est chargé qu'au premier
  // appel réel, et l'adaptateur reste synchrone à la création.
  cache = supabaseAuthAdapter({
    client: {
      auth: new Proxy(
        {},
        {
          get(_cible, methode) {
            return async (...args: unknown[]) => {
              const client = (await supabase.getClient()) as unknown as {
                auth: Record<string, (...a: unknown[]) => unknown>;
              };
              const fn = client.auth[methode as string];
              if (typeof fn !== 'function') {
                throw new TypeError(`auth.${String(methode)} inconnu`);
              }
              return fn.apply(client.auth, args);
            };
          },
        }
      ) as object,
    },
  }) as unknown as object;

  return cache;
}

/**
 * LE RÔLE, LU DANS LE JETON — jamais dans une table interrogée depuis le
 * navigateur.
 *
 * Le socle n'a rien pour les droits : `useActionGuard` garde des ACTIONS
 * (en ligne, confirmé), pas des rôles. Huit applications sont sur Supabase et
 * trois ont recopié le même `is_admin` en SQL ; c'est donc à ce niveau que le
 * besoin existe.
 *
 * Ce que rend ce crochet est un CONFORT D'INTERFACE : masquer un bouton que la
 * base refuserait de toute façon. **La sécurité est dans la RLS**, jamais ici —
 * un rôle lu côté client est une information d'affichage, pas une autorisation.
 */
export function useRole(): { admin: boolean; ready: boolean } {
  const { user, ready } = useAuthContext<unknown, Utilisateur>();
  const roles = user?.app_metadata?.roles;
  return {
    admin: Array.isArray(roles) && roles.includes('admin'),
    ready,
  };
}

interface Utilisateur {
  app_metadata?: { roles?: unknown };
}
