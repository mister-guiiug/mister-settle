import { createLogger } from '@mister-guiiug/dev-pwa-config/logger';
import { supabase } from '../../backend/supabase.ts';
import { localDb } from '../../backend/local.ts';

const log = createLogger('compte');

/**
 * Deux adresses sont la même à la casse et aux espaces près — la comparaison
 * qui décide si le geste de confirmation a été fait.
 */
export function memeAdresse(saisie: string, compte: string): boolean {
  const normalise = (v: string) => v.trim().toLowerCase();
  return normalise(saisie) !== '' && normalise(saisie) === normalise(compte);
}

/**
 * EFFACER SON COMPTE — l'article 17 du RGPD, sans écrire au mainteneur.
 *
 * CE N'EST PAS UN PORT : l'effacement d'un compte n'existe pas en mode local,
 * où il n'y a pas de compte. Ce module ne s'exécute que derrière la carte
 * « Zone dangereuse », rendue connecté seulement.
 *
 * L'ORDRE DES TROIS GESTES EST LE CONTRAT (squelette, ADR 0009) : la base
 * d'abord — si elle refuse, rien d'autre ne bouge ; le miroir local ensuite
 * — des espaces écrits avant qu'un backend ne soit configuré sur cet appareil
 * ne sont pas dans la base ; la session en dernier, en portée locale.
 *
 * Ce que le compte laisse dans ses ESPACES — sa personne, ses dépenses —
 * appartient aux autres membres et reste (H11 de l'analyse) : la fonction
 * `delete_my_account` ne touche que ce qui n'est qu'à lui.
 */
export async function deleteMyAccount(): Promise<void> {
  const db = await supabase.getClient();

  const { error } = await db.rpc('delete_my_account');
  if (error) {
    log.error('suppression du compte refusée', { message: error.message });
    throw new Error(error.message);
  }

  localDb.clear();

  const { error: deconnexion } = await db.auth.signOut({ scope: 'local' });
  if (deconnexion) {
    log.warn('session locale non effacée', { message: deconnexion.message });
  }
}
