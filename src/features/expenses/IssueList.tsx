import { ErrorBanner } from '@mister-guiiug/dev-pwa-config/react/error-banner';
import { useI18n } from '../../i18n/index.ts';
import type { Participant } from '../../backend/ports.ts';
import type { Issue } from '../../domain/expense.ts';
import { toDisplayNumber } from '../../domain/money.ts';

/**
 * Les vérifications du moteur, dites dans la langue de l'utilisateur : les
 * ERREURS bloquent la validation, les AVERTISSEMENTS s'affichent sans rien
 * empêcher (R8). Le code est stable ; c'est lui qu'on traduit et qu'on
 * teste ; les paramètres nomment la personne, ou chiffrent l'écart.
 */
export function IssueList({
  issues,
  participants,
  currency,
  minorUnit,
}: {
  issues: readonly Issue[];
  participants: readonly Participant[];
  currency: string;
  minorUnit: number;
}) {
  const { t, fmt } = useI18n();
  if (issues.length === 0) return null;
  const nameOf = (id: unknown) =>
    participants.find(p => p.id === id)?.displayName ?? '?';
  const render = (issue: Issue) => {
    const params: Record<string, string | number> = {};
    if (issue.params?.participantId !== undefined) {
      params.name = nameOf(issue.params.participantId);
    }
    if (typeof issue.params?.difference === 'number') {
      params.gap = fmt.currency(
        toDisplayNumber(issue.params.difference, minorUnit),
        currency
      );
    }
    return t(`issues.${issue.code}`, params);
  };
  const errors = issues.filter(issue => issue.severity === 'error');
  const warnings = issues.filter(issue => issue.severity === 'warning');
  const list = (items: readonly Issue[]) => (
    <ul className="m-0 flex list-disc flex-col gap-1 pl-4">
      {items.map((issue, index) => (
        <li key={`${issue.code}:${index}`}>{render(issue)}</li>
      ))}
    </ul>
  );
  return (
    <div className="flex flex-col gap-2">
      {errors.length > 0 ? <ErrorBanner message={list(errors)} /> : null}
      {warnings.length > 0 ? (
        <ErrorBanner tone="warning" message={list(warnings)} />
      ) : null}
    </div>
  );
}
