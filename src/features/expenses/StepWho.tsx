import { X } from 'lucide-react';
import { Button } from '@mister-guiiug/dev-pwa-config/react/button';
import { Card } from '@mister-guiiug/dev-pwa-config/react/card';
import {
  SelectField,
  TextField,
} from '@mister-guiiug/dev-pwa-config/react/field';
import { SegmentedControl } from '@mister-guiiug/dev-pwa-config/react/segmented-control';
import { useI18n } from '../../i18n/index.ts';
import type { Group, Participant, Space } from '../../backend/ports.ts';
import {
  addMember,
  amountsGap,
  assignRemainder,
  membersOf,
  payersGap,
  removeMember,
  toggleGroupIn,
  type ExpenseForm,
  type FormContext,
} from '../../domain/expense-form.ts';
import { toDisplayNumber, type Minor } from '../../domain/money.ts';
import { Avatar } from '../../components/Avatar.tsx';

const soft = { color: 'var(--dwc-text-soft)' } as const;
const METHODS = ['equal', 'amount', 'shares'] as const;

/**
 * PAS 2 — QUI A PAYÉ, POUR QUI. Un payeur par défaut ; « plusieurs payeurs »
 * déplie une part par personne, avec l'écart en direct (R3). La SÉLECTION
 * UNIFIÉE des bénéficiaires : des jetons « regroupements » et « personnes »,
 * puis la liste des personnes RÉELLEMENT retenues, dédoublonnée (R7), chaque
 * ligne retirable même venue d'un regroupement. Le modèle de répartition
 * ajoute ses champs sur ces lignes-là — montants avec reliquat (R5), parts
 * avec une part par défaut (R6).
 */
export function StepWho({
  form,
  setForm,
  ctx,
  space,
  participants,
  groups,
}: {
  form: ExpenseForm;
  setForm: (next: ExpenseForm) => void;
  ctx: FormContext;
  space: Space;
  participants: Participant[];
  groups: Group[];
}) {
  const { t, fmt } = useI18n();
  const money = (minor: Minor) =>
    fmt.currency(toDisplayNumber(minor, space.minorUnit), space.currency);
  const personOf = (id: string) => participants.find(p => p.id === id);
  const nameOf = (id: string) => personOf(id)?.displayName ?? '?';
  const members = membersOf(form, ctx);
  const memberIds = new Set(members.map(m => m.participantId));
  const paidGap = payersGap(form, ctx);
  const splitGap = amountsGap(form, ctx);

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3">
        <h2 className="m-0 text-base font-semibold">{t('wizard.payer')}</h2>
        <SegmentedControl
          value={form.payerMode}
          ariaLabel={t('wizard.payerMode')}
          fullWidth
          size="sm"
          options={[
            { value: 'single', label: t('wizard.onePayer') },
            { value: 'multi', label: t('wizard.severalPayers') },
          ]}
          onChange={value =>
            setForm({
              ...form,
              payerMode: value === 'multi' ? 'multi' : 'single',
            })
          }
        />
        {form.payerMode === 'single' ? (
          <SelectField
            label={t('wizard.payer')}
            value={form.singlePayerId ?? ''}
            onChange={event =>
              setForm({ ...form, singlePayerId: event.target.value || null })
            }
          >
            {participants.map(person => (
              <option key={person.id} value={person.id}>
                {person.displayName}
              </option>
            ))}
          </SelectField>
        ) : (
          <>
            {participants.map(person => (
              <TextField
                key={person.id}
                label={t('wizard.payerAmount', { name: person.displayName })}
                inputMode="decimal"
                value={form.payerTexts[person.id] ?? ''}
                onChange={event =>
                  setForm({
                    ...form,
                    payerTexts: {
                      ...form.payerTexts,
                      [person.id]: event.target.value,
                    },
                  })
                }
              />
            ))}
            <p className="m-0 text-sm" style={soft}>
              {paidGap === 0
                ? t('wizard.payersOk')
                : t('wizard.payersGap', { gap: money(paidGap) })}
            </p>
          </>
        )}
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="m-0 text-base font-semibold">
          {t('wizard.beneficiaries')}
        </h2>
        {groups.length > 0 ? (
          <>
            <p className="m-0 text-xs" style={soft}>
              {t('wizard.groups')}
            </p>
            <div className="flex flex-wrap gap-2">
              {groups.map(group => {
                const on = form.selectedGroupIds.includes(group.id);
                return (
                  <Button
                    key={group.id}
                    size="sm"
                    variant={on ? 'primary' : 'outline'}
                    aria-pressed={on}
                    onClick={() => setForm(toggleGroupIn(form, ctx, group.id))}
                  >
                    {group.name}
                  </Button>
                );
              })}
            </div>
          </>
        ) : null}
        <p className="m-0 text-xs" style={soft}>
          {t('wizard.people')}
        </p>
        <div className="flex flex-wrap gap-2">
          {participants.map(person => {
            const on = memberIds.has(person.id);
            return (
              <Button
                key={person.id}
                size="sm"
                variant={on ? 'primary' : 'outline'}
                aria-pressed={on}
                onClick={() =>
                  setForm(
                    on
                      ? removeMember(form, ctx, person.id)
                      : addMember(form, ctx, person.id)
                  )
                }
              >
                {person.displayName}
              </Button>
            );
          })}
        </div>

        <h3 className="m-0 mt-2 text-sm font-medium">{t('wizard.method')}</h3>
        <SegmentedControl
          value={form.splitMethod}
          ariaLabel={t('wizard.method')}
          fullWidth
          size="sm"
          options={METHODS.map(method => ({
            value: method,
            label: t(`wizard.methods.${method}`),
          }))}
          onChange={value =>
            setForm({
              ...form,
              splitMethod:
                value === 'amount'
                  ? 'amount'
                  : value === 'shares'
                    ? 'shares'
                    : 'equal',
            })
          }
        />

        <h3 className="m-0 mt-2 text-sm font-medium">
          {t('wizard.selected', { count: members.length })}
        </h3>
        {members.length === 0 ? (
          <p className="m-0 text-sm" style={soft}>
            {t('wizard.noneSelected')}
          </p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {members.map(member => {
              const person = personOf(member.participantId);
              const name = nameOf(member.participantId);
              return (
                <li
                  key={member.participantId}
                  className="flex flex-wrap items-center gap-2"
                >
                  <Avatar
                    size="sm"
                    name={name}
                    initials={person?.initials ?? ''}
                    color={person?.avatarColor ?? ''}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {name}
                    {member.viaGroupIds.length > 0 ? (
                      <span className="text-xs" style={soft}>
                        {' '}
                        {t('wizard.viaGroup', {
                          group: fmt.list(
                            member.viaGroupIds.map(
                              id => groups.find(g => g.id === id)?.name ?? '?'
                            )
                          ),
                        })}
                      </span>
                    ) : null}
                  </span>
                  {form.splitMethod === 'amount' ? (
                    <TextField
                      label={t('wizard.amountFor', { name })}
                      inputMode="decimal"
                      value={form.amountTexts[member.participantId] ?? ''}
                      className="w-32"
                      onChange={event =>
                        setForm({
                          ...form,
                          amountTexts: {
                            ...form.amountTexts,
                            [member.participantId]: event.target.value,
                          },
                        })
                      }
                    />
                  ) : null}
                  {form.splitMethod === 'amount' && splitGap !== 0 ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={t('wizard.assignRemainder', { name })}
                      onClick={() =>
                        setForm(
                          assignRemainder(form, ctx, member.participantId)
                        )
                      }
                    >
                      + {money(splitGap)}
                    </Button>
                  ) : null}
                  {form.splitMethod === 'shares' ? (
                    <TextField
                      label={t('wizard.sharesFor', { name })}
                      inputMode="decimal"
                      value={form.sharesTexts[member.participantId] ?? '1'}
                      className="w-24"
                      onChange={event =>
                        setForm({
                          ...form,
                          sharesTexts: {
                            ...form.sharesTexts,
                            [member.participantId]: event.target.value,
                          },
                        })
                      }
                    />
                  ) : null}
                  <Button
                    size="sm"
                    variant="ghost"
                    iconOnly
                    aria-label={t('wizard.removeMember', { name })}
                    onClick={() =>
                      setForm(removeMember(form, ctx, member.participantId))
                    }
                  >
                    <X size={16} aria-hidden="true" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
        {form.splitMethod === 'amount' ? (
          <p className="m-0 text-sm" style={soft}>
            {splitGap === 0
              ? t('wizard.amountsOk')
              : t('wizard.amountsGap', { gap: money(splitGap) })}
          </p>
        ) : null}
      </Card>
    </div>
  );
}
