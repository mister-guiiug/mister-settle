import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button } from '@mister-guiiug/dev-pwa-config/react/button';
import { Card, CardHeader } from '@mister-guiiug/dev-pwa-config/react/card';
import { ErrorBanner } from '@mister-guiiug/dev-pwa-config/react/error-banner';
import { LoginForm } from '@mister-guiiug/dev-pwa-config/react/login-form';
import { SkeletonGroup } from '@mister-guiiug/dev-pwa-config/react/skeleton';
import { useToast } from '@mister-guiiug/dev-pwa-config/react/toast';
import { useAuthContext } from '@mister-guiiug/dev-pwa-config/react/auth-provider';
import { useI18n } from '../../i18n/index.ts';
import { isRemote } from '../../backend/index.ts';
import { tokenFromInput } from '../../domain/invitations.ts';
import { ErrorMessage } from '../../components/ErrorMessage.tsx';
import { useSpaces } from '../spaces/store.ts';
import { useInvitations } from './store.ts';

/**
 * L'ACCEPTATION D'UN LIEN (`/invitation/:token`). Il faut un compte : sans
 * session, le formulaire du socle envoie un lien de connexion qui RAMÈNE ICI
 * — l'adresse de retour est celle de la page, jamais une constante. Une fois
 * dans l'espace, si l'invitation ne ciblait personne, on passe par les
 * personnes pour dire « c'est moi » (lot 5) ; l'historique est intact (R13).
 */
export function AcceptInvitationScreen() {
  const { t } = useI18n();
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { signedIn, ready, signInWithOtp } = useAuthContext<
    unknown,
    { email?: string }
  >();
  const accept = useInvitations(state => state.accept);
  const error = useInvitations(state => state.error);
  const clearError = useInvitations(state => state.clearError);
  const loadSpaces = useSpaces(state => state.load);
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);

  const home = (
    <Link to="/" className="no-underline">
      <Button variant="outline">{t('accept.home')}</Button>
    </Link>
  );

  if (!isRemote) {
    return (
      <Card>
        <CardHeader
          title={t('accept.title')}
          subtitle={t('accept.localBody')}
        />
        {home}
      </Card>
    );
  }
  if (!ready) return <SkeletonGroup label={t('accept.title')} lines={3} />;

  if (!signedIn) {
    if (sentTo) {
      return (
        <Card>
          <CardHeader
            title={t('account.linkSentTitle')}
            subtitle={t('account.linkSentBody', { email: sentTo })}
          />
          <Button variant="ghost" size="sm" onClick={() => setSentTo(null)}>
            {t('account.linkAgain')}
          </Button>
        </Card>
      );
    }
    return (
      <Card>
        <LoginForm
          mode="otp"
          title={t('accept.title')}
          busy={busy}
          error={loginError}
          onSubmit={values => {
            setBusy(true);
            setLoginError(null);
            void signInWithOtp({
              email: values.email,
              emailRedirectTo: window.location.href,
            })
              .then(result => {
                if (result.ok) setSentTo(values.email);
                else setLoginError(result.error?.message ?? null);
              })
              .finally(() => setBusy(false));
          }}
          footer={<p className="m-0 text-sm">{t('accept.signInHint')}</p>}
        />
      </Card>
    );
  }

  const join = async () => {
    setBusy(true);
    clearError();
    const result = await accept(tokenFromInput(token));
    setBusy(false);
    if (!result) return;
    await loadSpaces();
    toast.success(
      result.participantId ? t('accept.joined') : t('accept.sayWho')
    );
    void navigate(
      result.participantId
        ? `/e/${result.spaceId}`
        : `/e/${result.spaceId}/personnes`,
      { replace: true }
    );
  };

  return (
    <Card>
      <CardHeader title={t('accept.title')} subtitle={t('accept.body')} />
      {error ? (
        <ErrorBanner
          message={<ErrorMessage error={error} />}
          className="mb-3"
        />
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" loading={busy} onClick={() => void join()}>
          {t('accept.join')}
        </Button>
        {home}
      </div>
    </Card>
  );
}
