import { useState, type FormEvent } from 'react';
import { Plus } from 'lucide-react';
import { Badge } from '@mister-guiiug/dev-pwa-config/react/badge';
import { Button } from '@mister-guiiug/dev-pwa-config/react/button';
import { Card, CardHeader } from '@mister-guiiug/dev-pwa-config/react/card';
import { ErrorBanner } from '@mister-guiiug/dev-pwa-config/react/error-banner';
import {
  SelectField,
  TextAreaField,
  TextField,
} from '@mister-guiiug/dev-pwa-config/react/field';
import { Sheet } from '@mister-guiiug/dev-pwa-config/react/sheet';
import { SkeletonGroup } from '@mister-guiiug/dev-pwa-config/react/skeleton';
import { useToast } from '@mister-guiiug/dev-pwa-config/react/toast';
import { useActionGuard } from '@mister-guiiug/dev-pwa-config/react/use-action-guard';
import { useI18n } from '../../i18n/index.ts';
import { isRemote } from '../../backend/index.ts';
import type {
  Participant,
  Settlement,
  SettlementInput,
  Space,
} from '../../backend/ports.ts';
import { computeBalances } from '../../domain/balances.ts';
import { localDate, todayIso } from '../../domain/dates.ts';
import {
  parseAmount,
  toDecimalString,
  toDisplayNumber,
  type Minor,
} from '../../domain/money.ts';
import { byPosition } from '../../domain/people.ts';
import { suggestTransfers, type Transfer } from '../../domain/settle.ts';
import { ErrorMessage } from '../../components/ErrorMessage.tsx';
import { can, useCurrentSpace } from '../spaces/useCurrentSpace.ts';
import { usePeople, usePeopleOf } from '../people/store.ts';
import { useExpenses, useExpensesOf } from '../expenses/store.ts';

const soft = { color: 'var(--dwc-text-soft)' } as const;

/**
 * LES REMBOURSEMENTS. Les suggestions sont INFORMATIVES (R18) : un glouton
 * déterministe sur les soldes, au plus n − 1 opérations, recalculé à chaque
 * changement. Un remboursement DÉCLARÉ est une note partagée (R19) — datée,
 * annotée, annulable — et rien d'autre : l'application ne transfère aucun
 * argent, ne connaît aucune banque. Déclarer pose un toast avec « Annuler »
 * plutôt qu'une confirmation avant (ADR 0008).
 */
export function SettlementsScreen() {
  const { t, fmt } = useI18n();
  const space = useCurrentSpace();
  const toast = useToast();
  usePeopleOf(space?.id);
  useExpensesOf(space?.id);
  const participants = usePeople(state => state.participants);
  const peopleReady = usePeople(state => state.ready);
  const expenses = useExpenses(state => state.expenses);
  const settlements = useExpenses(state => state.settlements);
  const expensesReady = useExpenses(state => state.ready);
  const error = useExpenses(state => state.error);
  const clearError = useExpenses(state => state.clearError);
  const recordSettlement = useExpenses(state => state.recordSettlement);
  const cancelSettlement = useExpenses(state => state.cancelSettlement);
  const [declaring, setDeclaring] = useState<Transfer | 'manual' | null>(null);
  // Déclarer est un geste SERVEUR : sans réseau, le bouton le dit au lieu
  // de se cacher (ADR 0015). Sur l'appareil seul, rien à attendre.
  const guard = useActionGuard({
    online: isRemote,
    offlineMessage: t('sync.needsNetwork'),
  });

  if (!space) return null;
  if (!peopleReady || !expensesReady) {
    return <SkeletonGroup label={t('expenses.loading')} lines={4} />;
  }
  const rights = can(space.myRole);
  const editable = rights.contribute && !space.archivedAt;
  const money = (minor: Minor) =>
    fmt.currency(toDisplayNumber(minor, space.minorUnit), space.currency);
  const ordered = [...participants].sort(byPosition);
  const active = ordered.filter(p => !p.archivedAt);
  const nameOf = (id: string) =>
    ordered.find(p => p.id === id)?.displayName ?? '?';
  const lines = computeBalances({
    participantIds: ordered.map(p => p.id),
    expenses: expenses.filter(e => e.status === 'validated'),
    settlements,
  });
  const transfers = suggestTransfers(lines);

  const record = async (input: SettlementInput) => {
    const saved = await recordSettlement(input);
    if (!saved) return false;
    setDeclaring(null);
    toast.success(t('settlements.recorded'), {
      action: {
        label: t('settlements.undo'),
        onAction: () => void cancelSettlement(saved.id, saved.version),
      },
    });
    return true;
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 text-xs" style={soft}>
        {t('settlements.disclaimer')}
      </p>

      {error && !declaring ? (
        <ErrorBanner message={<ErrorMessage error={error} />} />
      ) : null}

      <Card>
        <CardHeader
          title={t('settlements.suggested')}
          subtitle={t('settlements.suggestedHint')}
        />
        {transfers.length === 0 ? (
          <p className="m-0 text-sm" style={soft}>
            {t('settlements.nothing')}
          </p>
        ) : (
          <ul className="settle-liste m-0 flex list-none flex-col gap-2 p-0 text-sm">
            {transfers.map(transfer => (
              <li
                key={`${transfer.fromParticipantId}:${transfer.toParticipantId}`}
                className="flex flex-wrap items-center gap-2"
              >
                <span className="min-w-0 flex-1 truncate">
                  {nameOf(transfer.fromParticipantId)} →{' '}
                  {nameOf(transfer.toParticipantId)}
                </span>
                <span className="font-medium">{money(transfer.amount)}</span>
                {editable ? (
                  <Button
                    size="sm"
                    variant="outline"
                    aria-disabled={guard.disabled}
                    onClick={() => {
                      if (!guard.allowed) return;
                      clearError();
                      setDeclaring(transfer);
                    }}
                  >
                    {t('settlements.declare')}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {editable ? (
        <div>
          <Button
            variant="primary"
            aria-disabled={guard.disabled}
            onClick={() => {
              if (!guard.allowed) return;
              clearError();
              setDeclaring('manual');
            }}
          >
            <Plus size={18} aria-hidden="true" />
            {t('settlements.declareManual')}
          </Button>
          {!guard.allowed && guard.reason ? (
            <p className="m-0 mt-1 text-xs" style={soft}>
              {guard.reason}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="m-0 text-xs" style={soft}>
          {t('settlements.readerHint')}
        </p>
      )}

      <Card>
        <CardHeader title={t('settlements.history')} />
        {settlements.length === 0 ? (
          <p className="m-0 text-sm" style={soft}>
            {t('settlements.none')}
          </p>
        ) : (
          <ul className="settle-liste m-0 flex list-none flex-col gap-2 p-0 text-sm">
            {settlements.map(settlement => (
              <SettlementRow
                key={settlement.id}
                settlement={settlement}
                nameOf={nameOf}
                money={money}
                editable={editable}
                onCancel={() =>
                  void cancelSettlement(settlement.id, settlement.version)
                }
              />
            ))}
          </ul>
        )}
      </Card>

      {declaring ? (
        <SettlementSheet
          key={
            declaring === 'manual'
              ? 'manual'
              : `${declaring.fromParticipantId}:${declaring.toParticipantId}:${declaring.amount}`
          }
          space={space}
          participants={active}
          {...(declaring === 'manual' ? {} : { suggestion: declaring })}
          onSubmit={record}
          onClose={() => setDeclaring(null)}
        />
      ) : null}
    </div>
  );
}

function SettlementRow({
  settlement,
  nameOf,
  money,
  editable,
  onCancel,
}: {
  settlement: Settlement;
  nameOf: (id: string) => string;
  money: (minor: Minor) => string;
  editable: boolean;
  onCancel: () => void;
}) {
  const { t, fmt } = useI18n();
  const cancelled = settlement.status === 'cancelled';
  return (
    <li className="flex flex-wrap items-center gap-2">
      <span className="min-w-0 flex-1 truncate">
        {fmt.date(localDate(settlement.settledOn))} ·{' '}
        {nameOf(settlement.fromParticipantId)} →{' '}
        {nameOf(settlement.toParticipantId)}
        {settlement.note ? ` · ${settlement.note}` : ''}
      </span>
      <span className={cancelled ? 'line-through' : 'font-medium'}>
        {money(settlement.amount)}
      </span>
      {cancelled ? (
        <Badge tone="muted" size="xs">
          {t('settlements.cancelled')}
        </Badge>
      ) : editable ? (
        <Button size="sm" variant="ghost" onClick={onCancel}>
          {t('settlements.cancel')}
        </Button>
      ) : null}
    </li>
  );
}

/**
 * La déclaration : qui rembourse, à qui, combien, quand, avec une note.
 * Préremplie depuis une suggestion, ou vierge. Le montant se lit en entier
 * d'unités mineures ; deux personnes différentes sont exigées — et la base
 * le vérifie aussi.
 */
function SettlementSheet({
  space,
  participants,
  suggestion,
  onSubmit,
  onClose,
}: {
  space: Space;
  participants: Participant[];
  suggestion?: Transfer;
  onSubmit: (input: SettlementInput) => Promise<boolean>;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const error = useExpenses(state => state.error);
  const [from, setFrom] = useState(
    suggestion?.fromParticipantId ?? participants[0]?.id ?? ''
  );
  const [to, setTo] = useState(
    suggestion?.toParticipantId ?? participants[1]?.id ?? ''
  );
  const [amountText, setAmountText] = useState(
    suggestion ? toDecimalString(suggestion.amount, space.minorUnit) : ''
  );
  const [settledOn, setSettledOn] = useState(todayIso());
  const [note, setNote] = useState('');
  const [amountError, setAmountError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const amount = parseAmount(amountText, space.minorUnit);
    if (amount === null || amount <= 0) {
      setAmountError(t('settlements.amountInvalid'));
      return;
    }
    setAmountError(null);
    setBusy(true);
    await onSubmit({
      spaceId: space.id,
      fromParticipantId: from,
      toParticipantId: to,
      amount,
      settledOn,
      note: note.trim(),
    });
    setBusy(false);
  };

  const options = participants.map(person => (
    <option key={person.id} value={person.id}>
      {person.displayName}
    </option>
  ));

  return (
    <Sheet open title={t('settlements.declareManual')} onClose={onClose}>
      <form
        onSubmit={event => void submit(event)}
        className="flex flex-col gap-4"
      >
        <SelectField
          label={t('settlements.from')}
          value={from}
          onChange={event => setFrom(event.target.value)}
        >
          {options}
        </SelectField>
        <SelectField
          label={t('settlements.to')}
          value={to}
          onChange={event => setTo(event.target.value)}
        >
          {options}
        </SelectField>
        <TextField
          label={t('settlements.amount', { currency: space.currency })}
          inputMode="decimal"
          value={amountText}
          required
          onChange={event => setAmountText(event.target.value)}
          {...(amountError ? { error: amountError } : {})}
        />
        <TextField
          label={t('settlements.date')}
          type="date"
          value={settledOn}
          required
          onChange={event => setSettledOn(event.target.value)}
        />
        <TextAreaField
          label={t('settlements.note')}
          value={note}
          maxLength={500}
          rows={2}
          onChange={event => setNote(event.target.value)}
        />
        {error ? (
          <ErrorBanner message={<ErrorMessage error={error} />} />
        ) : null}
        <div>
          <Button type="submit" variant="primary" loading={busy}>
            {t('settlements.save')}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
