import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@mister-guiiug/dev-pwa-config/react/button';
import { Card } from '@mister-guiiug/dev-pwa-config/react/card';
import { TextField } from '@mister-guiiug/dev-pwa-config/react/field';
import { EmptyState } from '@mister-guiiug/dev-pwa-config/react/empty-state';
import { ErrorBanner } from '@mister-guiiug/dev-pwa-config/react/error-banner';
import { SkeletonGroup } from '@mister-guiiug/dev-pwa-config/react/skeleton';
import { ConfirmDialog } from '@mister-guiiug/dev-pwa-config/react/confirm-dialog';
import { useI18n } from '../../i18n/index.ts';
import { useNotes } from './store.ts';

/**
 * L'écran d'exemple. Il n'a d'intérêt que par ce qu'il DÉMONTRE : un magasin
 * Zustand, la persistance versionnée derrière un port, les primitives du
 * socle, et une suppression qui demande confirmation.
 *
 * C'est le seul métier du squelette, et il est fait pour être supprimé.
 */
export function HomeScreen() {
  const { t, m, fmt } = useI18n();
  // Un SÉLECTEUR PAR CHAMP, jamais un objet construit dans le sélecteur : un
  // objet neuf à chaque rendu fait boucler `useSyncExternalStore` et rend une
  // page blanche. C'est un piège déjà rencontré dans le parc.
  const notes = useNotes(state => state.notes);
  const ready = useNotes(state => state.ready);
  const error = useNotes(state => state.error);
  const load = useNotes(state => state.load);
  const add = useNotes(state => state.add);
  const remove = useNotes(state => state.remove);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<string | null>(null);

  // La première lecture passe par le port : instantanée en local, requête
  // réseau une fois le backend distant configuré. L'écran ne sait pas lequel,
  // et c'est le but.
  useEffect(() => {
    void load();
  }, [load]);

  // Formulaire NON CONTRÔLÉ pour la soumission, contrôlé pour le champ : la
  // soumission passe par `onSubmit` afin que « Entrée » fonctionne au clavier,
  // pas seulement le clic sur le bouton.
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    void add(draft);
    setDraft('');
  };

  return (
    <>
      <form onSubmit={submit} className="flex items-end gap-2">
        <TextField
          label={t('home.field')}
          placeholder={t('home.placeholder')}
          value={draft}
          onChange={event => setDraft(event.target.value)}
          className="flex-1"
        />
        <Button type="submit" variant="primary">
          {t('home.add')}
        </Button>
      </form>

      {/* L'erreur d'écriture est PORTÉE À L'ÉCRAN, pas seulement journalisée :
          l'état a déjà été restauré, et sans ce bandeau la note disparaîtrait
          sans explication. */}
      {error ? <ErrorBanner message={error} className="mt-4" /> : null}

      {!ready ? (
        // `label` est OBLIGATOIRE : un squelette sans nom accessible est une
        // zone que rien n'annonce à un lecteur d'écran.
        <SkeletonGroup label={t('home.loading')} lines={3} className="mt-6" />
      ) : notes.length === 0 ? (
        <EmptyState
          title={t('home.empty')}
          description={t('home.emptyHint')}
          className="mt-8"
        />
      ) : (
        <>
          <p className="mt-6 text-sm" style={{ color: 'var(--dwc-text-soft)' }}>
            {/* `fmt.plural` suit la locale courante : ni « 1 notes », ni un
                accord codé en dur pour le seul français. Les FORMES se lisent
                dans `m`, le dictionnaire courant : `t()` ne rend que des
                feuilles, et `home.count` est un objet de formes. */}
            {fmt.plural(notes.length, m.home.count, { count: notes.length })}
          </p>

          <ul className="mt-3 flex list-none flex-col gap-2 p-0">
            {notes.map(note => (
              <li key={note.id}>
                <Card className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="m-0 break-words">{note.text}</p>
                    <p
                      className="m-0 text-xs"
                      style={{ color: 'var(--dwc-text-soft)' }}
                    >
                      {fmt.relative(note.createdAt)}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    iconOnly
                    aria-label={t('home.remove')}
                    onClick={() => setPending(note.id)}
                  >
                    <Trash2 size={18} aria-hidden="true" />
                  </Button>
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}

      <ConfirmDialog
        open={pending !== null}
        destructive
        title={t('home.removeConfirm')}
        message={t('home.removeBody')}
        onConfirm={() => {
          if (pending) remove(pending);
          setPending(null);
        }}
        onCancel={() => setPending(null)}
      />
    </>
  );
}
