import { createI18n } from '@mister-guiiug/dev-pwa-config/react/i18n';
import { messages } from './messages.ts';

/**
 * L'i18n de l'application, déclaré UNE FOIS au niveau module.
 *
 * `storageKey` n'est pas passé : le défaut `dwc_locale` est partagé par toutes
 * les apps de la famille, qui vivent sur la même origine GitHub Pages. La
 * langue choisie suit donc l'utilisateur de l'une à l'autre, et une valeur
 * inconnue de `locales` est simplement ignorée. Une app qui veut s'isoler
 * passe la sienne (motif famille : `'<app>_locale'`).
 *
 * `fmt` VIENT AVEC, et c'est le point. Le contexte rend des formateurs déjà
 * liés à la locale : `fmt.date(d)`, `fmt.number(v)`, `fmt.relative(d)`. Sans
 * eux, chaque écran refait le pont entre « la langue choisie » et « comment on
 * écrit les nombres » — ou l'oublie, ce que le parc a mesuré quatre-vingt-huit
 * fois sous la forme d'un `'fr-FR'` codé en dur.
 */
export const { I18nProvider, useI18n } = createI18n({
  messages,
  locales: ['fr', 'en'] as const,
  fallbackLocale: 'fr',
});
