import { useI18n } from '../i18n/index.ts';
import type { UiError } from '../features/spaces/store.ts';

/**
 * Un code d'erreur du port, dans la langue de l'utilisateur. Le détail — le
 * motif d'une saisie refusée, le message d'une erreur inconnue — est
 * interpolé tel quel : il vient de la base, il n'est pas traduit.
 */
export function ErrorMessage({ error }: { error: UiError }) {
  const { t } = useI18n();
  return <>{t(`errors.${error.code}`, { detail: error.detail })}</>;
}
