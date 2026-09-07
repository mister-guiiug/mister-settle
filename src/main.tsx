import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import {
  installErrorReporter,
  initSentry,
} from '@mister-guiiug/dev-pwa-config/react/observability';
import { ThemeProvider } from '@mister-guiiug/dev-pwa-config/react/theme-provider';
import { ToastProvider } from '@mister-guiiug/dev-pwa-config/react/toast';
import { VersionProvider } from '@mister-guiiug/dev-pwa-config/react/version';
import { AuthProvider } from '@mister-guiiug/dev-pwa-config/react/auth-provider';
import { I18nProvider } from './i18n/index.ts';
import { authAdapter } from './auth/index.ts';
import { env } from './app/config/env.ts';
import { App } from './App.tsx';
import './index.css';

/**
 * LA PILE DE FOURNISSEURS, ET SON ORDRE.
 *
 * L'ordre n'est pas décoratif :
 *
 *   1. `installErrorReporter()` AVANT tout le reste — une erreur levée au
 *      montage doit déjà être capturée, sinon la seule panne qu'on ne verra
 *      jamais est celle qui empêche l'app de s'afficher ;
 *   2. `initSentry` ne fait RIEN sans DSN, et ne charge alors pas une ligne de
 *      Sentry : le bundle d'une app sans observabilité reste intact ;
 *   3. `ThemeProvider` avant l'interface, pour que `data-theme` soit posé ;
 *   4. `I18nProvider` avant les composants du socle — il pose `LabelsProvider`
 *      avec la locale courante, ce que personne ne pensait à câbler à la main.
 *
 * Ce fichier est court, et c'est le but : la version longue est réécrite dans
 * chaque app, de 19 à 111 lignes selon les dépôts.
 */
installErrorReporter();
void initSentry({
  dsn: env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE,
});

const container = document.getElementById('app');
if (!container) throw new Error('Élément racine #app introuvable');

createRoot(container).render(
  <StrictMode>
    <VersionProvider>
      {/* `paint={false}` : les jetons `--dwc-*` sont peints par `index.css`
          avec la palette de l'app. Le fournisseur ne sert alors qu'à partager
          l'état clair/sombre et à tenir `data-theme` à jour — sans charger le
          catalogue des palettes de la famille. */}
      <ThemeProvider
        paint={false}
        themeColor={{ light: '#f7f8fa', dark: '#0f1115' }}
      >
        <I18nProvider>
          {/* L'adaptateur est `null` tant qu'aucun backend distant n'est
              configuré : le fournisseur se met alors en mode local, l'état
              reste « déconnecté », et les actions rendent une erreur nommée
              plutôt que d'échouer sur un client absent. */}
          <AuthProvider adapter={authAdapter()}>
            <ToastProvider>
              <App />
            </ToastProvider>
          </AuthProvider>
        </I18nProvider>
      </ThemeProvider>
    </VersionProvider>
  </StrictMode>
);
