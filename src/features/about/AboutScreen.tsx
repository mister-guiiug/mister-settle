import { Card, CardHeader } from '@mister-guiiug/dev-pwa-config/react/card';
import { AppVersion } from '@mister-guiiug/dev-pwa-config/react/app-version';
import { FamilyApps } from '@mister-guiiug/dev-pwa-config/react/family-apps';
import { PwaInstallPrompt } from '@mister-guiiug/dev-pwa-config/react/pwa-install-prompt';
import { AppFooter } from '@mister-guiiug/dev-pwa-config/react/app-footer';
import { useI18n } from '../../i18n/index.ts';
import { APP_ID, REPO_URL } from '../../app/links.ts';

/**
 * L'écran « à propos » : version, les autres apps de la famille, et le pied de
 * page — code source, soutien, signalement.
 *
 * `FamilyApps` et `AppVersion` sont donnés par le socle. Le lien du dépôt vient
 * de `repoUrl(APP_ID)` et le lien de soutien du catalogue : neuf apps sur neuf
 * avaient recopié ces deux URL dans un `links.ts` local, et aucune ne les
 * migrait toute seule.
 *
 * LE PIED DE PAGE EST ICI ET SUR L'ACCUEIL, nulle part ailleurs — la règle
 * famille du 06/09/2026, que `pwa-doctor` vérifie.
 *
 * `showSource={false}` PARCE QUE LES DEUX COMPOSANTS PORTENT LA MÊME PAIRE.
 * `FamilyApps` rend « Code source » et « M'offrir un café » dès qu'il reçoit un
 * `repoUrl` (`showSource` vaut `!!repoUrl`) : avec le pied de page sur le même
 * écran, l'utilisateur voyait deux fois chaque lien, et un test qui les
 * cherchait par leur nom accessible n'en trouvait plus un seul. Ici, la grille
 * des applications sœurs ; en dessous, les trois liens, une fois. Le défaut
 * n'existait pas tant que le pied de page vivait dans la coquille.
 *
 * `PwaInstallPrompt` NE REND RIEN tant que le navigateur n'a pas dit que
 * l'application est installable (`beforeinstallprompt`), ni une fois qu'elle
 * l'est : c'est une région qui apparaît, pas un bouton grisé. Le socle le
 * livrait depuis longtemps avec zéro adoptant — cinq apps avaient réécrit le
 * leur.
 */
export function AboutScreen() {
  const { t } = useI18n();

  return (
    <div className="flex flex-col gap-4">
      <PwaInstallPrompt />

      <Card>
        <CardHeader title={t('about.title')} subtitle={t('app.tagline')} />
        <p className="m-0">{t('about.what')}</p>
      </Card>

      <Card>
        <CardHeader title={t('about.version')} />
        {/* `details` montre la date de build et le commit : de quoi savoir ce
            qui tourne réellement quand quelqu'un décrit une anomalie. */}
        <AppVersion details updates repoUrl={REPO_URL} />
      </Card>

      <FamilyApps
        currentAppId={APP_ID}
        repoUrl={REPO_URL}
        showSource={false}
        showRepoLinks
      />

      <AppFooter repoUrl={REPO_URL} issues />
    </div>
  );
}
