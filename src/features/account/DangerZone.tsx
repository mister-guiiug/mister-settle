import { useState } from 'react';
import { Button } from '@mister-guiiug/dev-pwa-config/react/button';
import { Card, CardHeader } from '@mister-guiiug/dev-pwa-config/react/card';
import { TextField } from '@mister-guiiug/dev-pwa-config/react/field';
import { ErrorBanner } from '@mister-guiiug/dev-pwa-config/react/error-banner';
import { useI18n } from '../../i18n/index.ts';
import { deleteMyAccount, memeAdresse } from './delete-account.ts';

interface DangerZoneProps {
  /** L'adresse du compte connecté — celle qu'il faudra retaper. */
  email: string;
  /** Injectable pour les tests ; en production, la RPC `delete_my_account()`. */
  onDelete?: () => Promise<void>;
}

/**
 * LA ZONE DANGEREUSE — le droit à l'effacement, à portée de main et hors de
 * portée du doigt qui glisse.
 *
 * POURQUOI PAS `ConfirmDialog`. Le squelette vient de décider l'inverse pour
 * les suppressions courantes (ADR 0008 : annuler, plutôt que confirmer). Un
 * compte effacé, lui, ne se rattrape pas : il n'y a rien à remettre à sa
 * place, et un sursis de huit secondes serait un mensonge. Ce geste-là est le
 * seul du squelette qui mérite une barrière — et une barrière à « OK » n'en
 * est pas une : c'est le même clic que celui qu'on regrette, deux fois de
 * suite. Retaper son adresse demande de LIRE, donc de comprendre.
 *
 * L'ADRESSE MAL RETAPÉE NE DÉSACTIVE PAS LE BOUTON, ELLE RÉPOND. Un bouton
 * grisé sans explication laisse chercher ce qui manque, et un lecteur d'écran
 * n'annonce qu'« indisponible ». Ici la soumission est toujours possible, et
 * c'est le refus qui est dit — `ErrorBanner` porte `role="alert"`.
 *
 * ELLE N'EXISTE PAS EN MODE LOCAL : `AccountScreen` ne la rend que connecté,
 * donc jamais sans backend distant. Un « supprimer mon compte » qui n'efface
 * rien serait pire que son absence.
 */
export function DangerZone({ email, onDelete }: DangerZoneProps) {
  const { t } = useI18n();
  const [ouverte, setOuverte] = useState(false);
  const [saisie, setSaisie] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const effacer = (event: React.FormEvent) => {
    event.preventDefault();
    if (!memeAdresse(saisie, email)) {
      setErreur(t('account.danger.mismatch'));
      return;
    }
    setErreur(null);
    setBusy(true);
    void (onDelete ?? deleteMyAccount)()
      .catch((cause: unknown) =>
        setErreur(
          t('account.danger.failed', {
            error: cause instanceof Error ? cause.message : String(cause),
          })
        )
      )
      .finally(() => setBusy(false));
  };

  return (
    <Card className="mt-6" data-testid="zone-dangereuse">
      <CardHeader
        title={t('account.danger.title')}
        subtitle={t('account.danger.body')}
      />

      {!ouverte ? (
        <Button variant="danger" onClick={() => setOuverte(true)}>
          {t('account.danger.action')}
        </Button>
      ) : (
        <form onSubmit={effacer} className="flex flex-col gap-3">
          {/* L'adresse attendue est ÉCRITE : on demande de la recopier
              sciemment, pas de la deviner. */}
          <TextField
            label={t('account.danger.confirmLabel')}
            hint={t('account.danger.confirmHint', { email })}
            value={saisie}
            autoComplete="off"
            onChange={event => setSaisie(event.target.value)}
          />
          {erreur ? <ErrorBanner message={erreur} /> : null}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="danger" loading={busy}>
              {t('account.danger.confirm')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setOuverte(false);
                setSaisie('');
                setErreur(null);
              }}
            >
              {t('account.danger.cancel')}
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}
