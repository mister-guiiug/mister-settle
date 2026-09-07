import { createLogger } from '@mister-guiiug/dev-pwa-config/logger';
import { supabase } from '../../backend/supabase.ts';
import { notesStore } from '../../backend/local.ts';

const log = createLogger('compte');

/**
 * Deux adresses sont la même à la casse et aux espaces près — la comparaison
 * qui décide si le geste de confirmation a été fait. Elle vit ICI et non dans
 * le composant : une fonction exportée à côté d'un composant casse le
 * rafraîchissement à chaud (`react-refresh/only-export-components`), et cette
 * règle-là appartient de toute façon à l'effacement, pas à son affichage.
 */
export function memeAdresse(saisie: string, compte: string): boolean {
  const normalise = (v: string) => v.trim().toLowerCase();
  return normalise(saisie) !== '' && normalise(saisie) === normalise(compte);
}

/**
 * EFFACER SON COMPTE — l'article 17 du RGPD, sans écrire au mainteneur.
 *
 * CE N'EST PAS UN PORT, ET C'EST DÉLIBÉRÉ. `Backend` décrit ce dont
 * l'application a besoin quel que soit le fournisseur ; or l'effacement d'un
 * compte n'existe PAS en mode local — il n'y a pas de compte. Le déclarer au
 * port obligerait l'adaptateur local à implémenter un geste sans objet, et
 * l'écran devrait quand même distinguer les deux cas. La carte « Zone
 * dangereuse » n'est rendue qu'en mode distant, et ce module ne s'exécute que
 * derrière elle.
 *
 * L'ORDRE DES TROIS GESTES EST LE CONTRAT.
 *
 *  1. LA BASE D'ABORD. Si le serveur refuse, on lève et on ne touche à rien
 *     d'autre : l'utilisateur reste connecté, voit l'erreur, et peut
 *     recommencer. L'inverse — déconnecter puis effacer — laisserait un compte
 *     intact et quelqu'un dehors, sans moyen d'y revenir ;
 *  2. LE MIROIR LOCAL ENSUITE. Le magasin versionné peut porter des notes
 *     écrites avant qu'un backend ne soit configuré sur cet appareil. Elles ne
 *     sont pas dans la base, donc `delete_my_account()` ne les voit pas — et
 *     « supprimer mon compte » ne peut pas laisser des données de l'utilisateur
 *     sur l'écran suivant. Le thème et la langue restent : ce sont des
 *     préférences d'appareil, pas des données de compte ;
 *  3. LA SESSION EN DERNIER, et **en portée locale**. Une déconnexion globale
 *     demande au serveur de révoquer les jetons ; le compte n'existant plus, la
 *     requête échoue, et l'application garde une session qui ne mène nulle
 *     part. `scope: 'local'` efface la session sur l'appareil sans rien
 *     demander : c'est la seule qui puisse suivre une suppression de compte.
 *     `onAuthStateChange` émet `SIGNED_OUT`, et le fournisseur du socle rend
 *     l'écran déconnecté tout seul.
 */
export async function deleteMyAccount(): Promise<void> {
  const db = await supabase.getClient();

  // Le nom de la fonction est celui de `0005_supprimer_son_compte.sql`. Elle
  // est `security definer` et n'accepte aucun argument : l'identité vient du
  // jeton (`auth.uid()`), jamais du client. Passer l'identifiant en paramètre
  // aurait laissé le client demander l'effacement de quelqu'un d'autre.
  const { error } = await db.rpc('delete_my_account');
  if (error) {
    log.error('suppression du compte refusée', { message: error.message });
    throw new Error(error.message);
  }

  notesStore.clear();

  const { error: deconnexion } = await db.auth.signOut({ scope: 'local' });
  // La session locale qui résiste ne remet pas le compte en place : on le
  // journalise et on rend la main, plutôt que de faire croire à un échec de
  // l'effacement — qui, lui, a bien eu lieu.
  if (deconnexion) log.warn('session locale non effacée', deconnexion);
}
