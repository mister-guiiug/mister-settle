import { Card, CardHeader } from '@mister-guiiug/dev-pwa-config/react/card';
import { ErrorBanner } from '@mister-guiiug/dev-pwa-config/react/error-banner';
import { Stat } from '@mister-guiiug/dev-pwa-config/react/stat';
import { useI18n } from '../../i18n/index.ts';
import type {
  Category,
  Group,
  Participant,
  Space,
} from '../../backend/ports.ts';
import { localDate } from '../../domain/dates.ts';
import type { Issue } from '../../domain/expense.ts';
import {
  allocationsOf,
  beneficiaryLines,
  payerLines,
  totalOf,
  type ExpenseForm,
  type FormContext,
  type ImpactLine,
} from '../../domain/expense-form.ts';
import {
  sharesToDecimalString,
  toDisplayNumber,
  type Minor,
} from '../../domain/money.ts';
import { Avatar } from '../../components/Avatar.tsx';
import { categoryName } from './category-label.ts';
import { IssueList } from './IssueList.tsx';

const soft = { color: 'var(--dwc-text-soft)' } as const;

/**
 * PAS 3 — SYNTHÈSE ET VALIDATION : tout ce qui va s'enregistrer, le montant
 * par personne (et ses parts), les regroupements utilisés, les erreurs et
 * avertissements, et l'IMPACT PRÉVISIONNEL sur les soldes — avant → après.
 * C'est ici, et seulement ici, qu'on valide une répartition (R9).
 */
export function StepSummary({
  form,
  ctx,
  space,
  participants,
  groups,
  categories,
  issues,
  impact,
  validationChanged,
}: {
  form: ExpenseForm;
  ctx: FormContext;
  space: Space;
  participants: Participant[];
  groups: Group[];
  categories: Category[];
  issues: Issue[];
  impact: ImpactLine[];
  /** `null` : pas de validation à préserver ; sinon, a-t-elle changé ? */
  validationChanged: boolean | null;
}) {
  const { t, fmt } = useI18n();
  const money = (minor: Minor) =>
    fmt.currency(toDisplayNumber(minor, space.minorUnit), space.currency);
  const personOf = (id: string) => participants.find(p => p.id === id);
  const nameOf = (id: string) => personOf(id)?.displayName ?? '?';
  const avatarOf = (id: string) => {
    const person = personOf(id);
    return (
      <Avatar
        size="sm"
        name={person?.displayName ?? '?'}
        initials={person?.initials ?? ''}
        color={person?.avatarColor ?? ''}
      />
    );
  };
  const total = totalOf(form, ctx) ?? 0;
  const payers = payerLines(form, ctx);
  const lines = beneficiaryLines(form, ctx);
  const allocations = allocationsOf(form, ctx) ?? [];
  const category = categories.find(c => c.id === form.categoryId);
  const subcategory = categories.find(c => c.id === form.subcategoryId);
  const groupNames = form.selectedGroupIds.map(
    id => groups.find(g => g.id === id)?.name ?? '?'
  );

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader
          title={form.label.trim() || '—'}
          subtitle={`${fmt.date(localDate(form.spentOn))}${
            category ? ` · ${categoryName(category, t)}` : ''
          }${subcategory ? ` › ${categoryName(subcategory, t)}` : ''}`}
        />
        <dl className="m-0 grid grid-cols-2 gap-3">
          <Stat label={t('wizard.total')} value={money(total)} />
          <Stat
            label={t('expense.payers')}
            value={fmt.list(payers.map(p => nameOf(p.participantId)))}
          />
        </dl>
        {payers.length > 1 ? (
          <ul className="m-0 mt-3 flex list-none flex-col gap-1 p-0 text-sm">
            {payers.map(payer => (
              <li key={payer.participantId} className="flex items-center gap-2">
                {avatarOf(payer.participantId)}
                <span className="min-w-0 flex-1 truncate">
                  {nameOf(payer.participantId)}
                </span>
                <span>{money(payer.amount)}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </Card>

      {validationChanged === true ? (
        <ErrorBanner tone="warning" message={t('wizard.needsRevalidation')} />
      ) : validationChanged === false ? (
        <ErrorBanner tone="info" message={t('wizard.stillValid')} />
      ) : null}

      <IssueList
        issues={issues}
        participants={participants}
        currency={space.currency}
        minorUnit={space.minorUnit}
      />

      <Card>
        <CardHeader
          title={t('wizard.perPerson')}
          subtitle={t(`expense.method.${form.splitMethod}`)}
        />
        <ul className="m-0 flex list-none flex-col gap-2 p-0 text-sm">
          {lines.map(line => {
            const allocation = allocations.find(
              a => a.participantId === line.participantId
            );
            return (
              <li key={line.participantId} className="flex items-center gap-2">
                {avatarOf(line.participantId)}
                <span className="min-w-0 flex-1 truncate">
                  {nameOf(line.participantId)}
                  {line.viaGroupId ? (
                    <span className="text-xs" style={soft}>
                      {' '}
                      {t('wizard.viaGroup', {
                        group:
                          groups.find(g => g.id === line.viaGroupId)?.name ??
                          '?',
                      })}
                    </span>
                  ) : null}
                </span>
                {line.shares !== null && Number.isFinite(line.shares) ? (
                  <span className="text-xs" style={soft}>
                    {t('expense.shares', {
                      shares: sharesToDecimalString(line.shares),
                    })}
                  </span>
                ) : null}
                <span className="font-medium">
                  {allocation ? money(allocation.amount) : '—'}
                </span>
              </li>
            );
          })}
        </ul>
        {groupNames.length > 0 ? (
          <p className="m-0 mt-3 text-xs" style={soft}>
            {t('expense.groupsUsed')} : {fmt.list(groupNames)}
          </p>
        ) : null}
      </Card>

      {impact.length > 0 ? (
        <Card>
          <CardHeader title={t('expense.impact')} />
          <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm">
            {impact.map(line => (
              <li
                key={line.participantId}
                className="flex items-center justify-between gap-2"
              >
                <span className="min-w-0 truncate">
                  {nameOf(line.participantId)}
                </span>
                <span>
                  {t('expense.beforeAfter', {
                    before: money(line.before),
                    after: money(line.after),
                  })}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
