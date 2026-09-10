import {
  navigateurHorsLigne,
  storedSupabaseSession,
} from '@mister-guiiug/dev-pwa-config/auth/stored-session';

/**
 * QUI SUIS-JE, SANS ATTENDRE LE RÉSEAU POUR LE SAVOIR.
 *
 * `auth.getSession()` n'est pas une lecture : jeton d'accès périmé — et il ne
 * vit qu'une heure — il part le RENOUVELER contre le réseau, avec des reprises
 * à intervalle croissant. Sans réseau, aucune ne peut aboutir : une demi-minute
 * pour apprendre son propre identifiant, alors qu'il est écrit sur l'appareil.
 *
 * L'ADAPTATEUR DU SOCLE NE COUVRAIT PAS CE CHEMIN. `src/auth/index.ts` le
 * branche bien, et depuis 4.9.0 le démarrage ne dépend plus du réseau — mais
 * `me()` appelait `db.auth.getSession()` DIRECTEMENT sur le client, hors de
 * l'adaptateur. Le passer par lui créerait un cycle (`auth/index` importe déjà
 * ce module) : on emprunte donc au socle la même brique, `auth/stored-session`,
 * plutôt que son adaptateur.
 *
 * CE N'EST PAS UN CONTOURNEMENT DE SÉCURITÉ. L'identifiant rendu sert à écrire
 * des `where` (`.eq('user_id', …)`) ; c'est la RLS, côté serveur, qui décide de
 * ce que la requête a le droit de voir, à partir du jeton — jamais de cette
 * valeur. Une session périmée ou révoquée sera refusée là-bas, comme avant.
 */

/**
 * Combien de temps attendre le serveur avant de se rabattre sur le stockage.
 *
 * `navigator.onLine` ne protège que du cas franc : il est vrai derrière un
 * portail captif comme sur un Wi-Fi qui ne route rien. Là, l'appel part et ne
 * revient jamais — sans lever, donc sans qu'aucun `catch` ne serve.
 */
const ATTENTE_MS = 5_000;

/** Marqueur d'attente dépassée, distinct de « pas de session ». */
const TROP_LONG = Symbol('attente dépassée');

/** L'identifiant lu dans la session rangée sur l'appareil, s'il y en a une. */
export function identifiantRange(): string | undefined {
  const session = storedSupabaseSession() as { user?: { id?: string } } | null;
  const id = session?.user?.id;
  return typeof id === 'string' && id.length > 0 ? id : undefined;
}

/**
 * L'identifiant de l'utilisateur courant, ou `undefined`.
 *
 * @param demanderAuServeur Ce que fait Supabase quand on le lui demande —
 * injecté pour que cette décision s'éprouve sans client ni réseau.
 * @param attenteMs Surchargeable pour les tests.
 */
export async function identifiantDeSession(
  demanderAuServeur: () => Promise<string | undefined>,
  attenteMs: number = ATTENTE_MS
): Promise<string | undefined> {
  // Hors ligne : ne rien demander. La réponse est déjà sur l'appareil, et
  // Supabase mettrait une demi-minute à dire qu'il ne sait pas.
  if (navigateurHorsLigne()) {
    const range = identifiantRange();
    if (range) return range;
  }

  let minuteur: ReturnType<typeof setTimeout> | undefined;
  try {
    const issue = await Promise.race([
      demanderAuServeur(),
      new Promise<typeof TROP_LONG>(resoudre => {
        minuteur = setTimeout(() => resoudre(TROP_LONG), attenteMs);
      }),
    ]);
    return issue === TROP_LONG ? identifiantRange() : issue;
  } catch {
    // Le réseau a lâché en cours de route : le stockage sait encore.
    return identifiantRange();
  } finally {
    clearTimeout(minuteur);
  }
}
