import { useState } from 'react';
import { Button } from '@mister-guiiug/dev-pwa-config/react/button';
import { Card, CardHeader } from '@mister-guiiug/dev-pwa-config/react/card';
import { Badge } from '@mister-guiiug/dev-pwa-config/react/badge';
import { LoginForm } from '@mister-guiiug/dev-pwa-config/react/login-form';
import { useAuthContext } from '@mister-guiiug/dev-pwa-config/react/auth-provider';
import { useI18n } from '../../i18n/index.ts';
import { useRole } from '../../auth/index.ts';
import { coverage } from '../../backend/index.ts';

/**
 * L'écran de compte — le formulaire que quatre applications avaient écrit
 * chacune (64, 58, 218 et 170 lignes), pour le même écran.
 *
 * LE LIEN D'ABORD, LE MOT DE PASSE EN OPTION. Les deux applications qui ont
 * écrit un écran de compte en septembre 2026 (miss-carbook, mister-miss-koh)
 * passent par un lien à usage unique : l'application ne voit passer aucun
 * secret et n'en stocke aucun — ni réinitialisation, ni fuite possible par
 * le bundle. `LoginForm mode="otp"` ne rend qu'un champ ; le mode mot de
 * passe reste à un clic, pour qui y tient.
 *
 * `LoginForm` du socle est NON CONTRÔLÉ et lu par `FormData` : c'est ce qui le
 * rend testable sans simuler la frappe, et c'est une décision du socle, pas un
 * oubli.
 *
 * SANS BACKEND, L'ÉCRAN RESTE. Il dit que le mode est local au lieu de
 * disparaître : un écran masqué par une condition finit par diverger de
 * celui qui s'affiche, et personne ne le voit avant la mise en service.
 */
type Mode = 'link' | 'password';

export function AccountScreen() {
  const { t } = useI18n();
  const { signedIn, user, signIn, signInWithOtp, signOut, ready } =
    useAuthContext<unknown, { email?: string }>();
  const { admin } = useRole();
  const [mode, setMode] = useState<Mode>('link');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  if (coverage.kind !== 'supabase') {
    return (
      <Card>
        <CardHeader
          title={t('account.title')}
          subtitle={t('account.localMode')}
        />
        <p className="m-0">{t('account.localModeBody')}</p>
      </Card>
    );
  }

  if (!ready) return null;

  if (signedIn) {
    return (
      <Card>
        <CardHeader
          title={t('account.title')}
          subtitle={user?.email ?? ''}
          action={
            admin ? <Badge tone="info">{t('account.admin')}</Badge> : null
          }
        />
        <Button variant="outline" onClick={() => void signOut()}>
          {t('account.signOut')}
        </Button>
      </Card>
    );
  }

  if (sentTo) {
    return (
      <Card>
        <CardHeader title={t('account.linkSentTitle')} />
        <p role="status" className="m-0">
          {t('account.linkSentBody', { email: sentTo })}
        </p>
        <Button variant="ghost" size="sm" onClick={() => setSentTo(null)}>
          {t('account.linkAgain')}
        </Button>
      </Card>
    );
  }

  const switchMode = () => {
    setMode(m => (m === 'link' ? 'password' : 'link'));
    setError(null);
  };

  return (
    <Card>
      <LoginForm
        mode={mode === 'link' ? 'otp' : 'signin'}
        title={t('account.title')}
        busy={busy}
        error={error}
        onSubmit={values => {
          setBusy(true);
          setError(null);
          const action =
            mode === 'link'
              ? // Le retour du lien est calculé depuis l'origine SERVIE, jamais
                // depuis une constante : le même bundle tourne en local et sur
                // Pages. L'adresse doit figurer dans la liste d'URL autorisées
                // du projet, qui ne contient que localhost:3000 à la création.
                signInWithOtp({
                  email: values.email,
                  emailRedirectTo: `${window.location.origin}${import.meta.env.BASE_URL}`,
                }).then(result => {
                  if (result.ok) setSentTo(values.email);
                  else setError(result.error?.message ?? null);
                })
              : signIn(values.email, values.password).then(result => {
                  // Le message est DÉJÀ traduit par `auth/errors-fr` du socle.
                  if (!result.ok) setError(result.error?.message ?? null);
                });
          void action.finally(() => setBusy(false));
        }}
        footer={
          <div className="flex flex-col gap-2">
            {mode === 'link' && (
              <p className="m-0 text-sm">{t('account.linkIntro')}</p>
            )}
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={switchMode}
            >
              {mode === 'link'
                ? t('account.usePassword')
                : t('account.useLink')}
            </Button>
          </div>
        }
      />
    </Card>
  );
}
