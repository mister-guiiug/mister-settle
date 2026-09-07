import { repoUrl } from '@mister-guiiug/dev-pwa-config/apps-catalog';

/**
 * L'identité de l'application, en un seul endroit.
 *
 * `APP_ID` est le nom du dépôt GitHub. Tout en dérive : le chemin de base du
 * déploiement, le `scope` du manifeste, l'URL de la page publiée, et le lien du
 * code source ci-dessous.
 *
 * LE LIEN DU DÉPÔT SE CALCULE, IL NE SE RECOPIE PAS. Neuf apps sur neuf avaient
 * un `links.ts` portant l'URL en dur ; aucune ne l'a migrée toute seule, parce
 * qu'un remplacement d'import ne suffisait pas — il fallait passer d'une
 * constante à un appel. Le lien de SOUTIEN, lui, n'apparaît pas ici du tout :
 * `FamilyApps` et `AppFooter` le prennent au catalogue, qui fait foi.
 */
export const APP_ID = 'mister-settle';

export const REPO_URL = repoUrl(APP_ID);
