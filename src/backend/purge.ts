import { readCache } from './index.ts';
import { useSyncState } from './sync-state.ts';
import { clearExpenseQueue } from './sync.ts';

/**
 * CE QUI APPARTIENT À LA SESSION NE LUI SURVIT PAS (ADR 0015).
 *
 * Deux choses vivent sur l'APPAREIL et non dans le compte : la copie des
 * lectures (IndexedDB `mister-settle-cache`) et la file des créations
 * (`settle-sync`). Jusqu'au 05/11/2026, la déconnexion et la suppression du
 * compte ne les touchaient pas : sur un appareil partagé, le compte suivant
 * relisait hors ligne les espaces du précédent, et ses rejeux partaient sous
 * la mauvaise session — avec ses droits, à son nom.
 *
 * La file d'abord : elle seule pourrait encore ÉCRIRE. La copie ensuite, et
 * l'indication « copie du … » avec elle.
 */
export async function purgeSessionData(): Promise<void> {
  clearExpenseQueue();
  await readCache.clear();
  useSyncState.getState().markFresh();
}
