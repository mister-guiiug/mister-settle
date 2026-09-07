import { useI18n } from '../i18n/index.ts';
import type { UiError } from '../features/spaces/store.ts';

/**
 * Les motifs de refus que l'adaptateur local NOMME par un code : ceux-là se
 * traduisent. Tout autre détail — le message d'une fonction de la base, une
 * erreur inconnue — s'interpole tel quel : il n'est pas à nous.
 */
const KNOWN_DETAILS = [
  'duplicate-name',
  'participant-linked',
  'foreign-member',
  'same-person',
  'amount-not-positive',
  'image-type',
  'image-size',
] as const;
type KnownDetail = (typeof KNOWN_DETAILS)[number];
const isKnownDetail = (detail: string): detail is KnownDetail =>
  (KNOWN_DETAILS as readonly string[]).includes(detail);

/** Un code d'erreur du port, dans la langue de l'utilisateur. */
export function ErrorMessage({ error }: { error: UiError }) {
  const { t } = useI18n();
  if (error.code === 'invalid' && isKnownDetail(error.detail)) {
    return <>{t(`errorDetail.${error.detail}`)}</>;
  }
  return <>{t(`errors.${error.code}`, { detail: error.detail })}</>;
}
