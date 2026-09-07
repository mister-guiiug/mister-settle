import { useSyncExternalStore } from 'react';
import { SyncStatusBadge } from '@mister-guiiug/dev-pwa-config/react/sync-status-badge';
import { ErrorBanner } from '@mister-guiiug/dev-pwa-config/react/error-banner';
import { useI18n } from '../../i18n/index.ts';
import type { QueuedNotes } from '../../backend/queued-notes.ts';

interface SyncStateProps {
  sync: QueuedNotes;
  /** Relire la vérité du serveur après avoir abandonné un refus. */
  onResync: () => void;
}

/**
 * CE QUE LA FILE A À DIRE — et il faut qu'elle le dise, sinon elle ment.
 *
 * Une file d'écritures hors ligne est une promesse : « c'est parti, même si
 * vous ne voyez rien ». Une promesse muette qui échoue est pire que pas de
 * promesse du tout — l'écran affiche une note que la base a refusée, et
 * personne ne l'apprend avant le prochain appareil.
 *
 * Deux choses, donc, et pas une :
 *
 *  - **l'état**, en continu, par `SyncStatusBadge` du socle : « hors ligne »
 *    dès la coupure (avant même la première écriture retenue), « en attente
 *    (N) » pendant le rejeu, rien de spécial quand tout est passé. Ses
 *    libellés viennent de `react/labels`, déjà traduits en sept langues ;
 *  - **le refus durable**, en bandeau, avec les deux seules suites possibles :
 *    réessayer — les lettres mortes repartent en tête de file, compteurs
 *    remis à zéro — ou abandonner, ce qui relit le serveur et fait
 *    disparaître de l'écran ce qu'il n'a jamais accepté.
 *
 * `useSyncExternalStore` avec un instantané MÉMORISÉ : `getSnapshot` rend le
 * même objet tant que rien n'a changé. Un objet neuf à chaque lecture ferait
 * boucler le rendu — c'est le piège que le parc a déjà payé sur des sélecteurs
 * Zustand, et il est identique ici.
 */
export function SyncState({ sync, onResync }: SyncStateProps) {
  const { t, m, fmt } = useI18n();
  const etat = useSyncExternalStore(sync.subscribe, sync.getSnapshot);

  return (
    <>
      <SyncStatusBadge
        status={etat.status}
        pending={etat.pending}
        className="text-sm"
      />

      {etat.dead > 0 ? (
        <ErrorBanner
          tone="danger"
          className="mt-3"
          message={fmt.plural(etat.dead, m.home.sync.refused, {
            count: etat.dead,
            error: etat.lastError ?? '',
          })}
          retryLabel={t('home.sync.retry')}
          onRetry={() => {
            sync.queue.requeueDead();
            void sync.queue.flush();
          }}
          onDismiss={() => {
            sync.queue.clearDead();
            onResync();
          }}
        />
      ) : null}
    </>
  );
}
