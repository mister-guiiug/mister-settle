import { useState } from 'react';
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import { createUuid } from '@mister-guiiug/dev-pwa-config/id';
import { Button } from '@mister-guiiug/dev-pwa-config/react/button';
import { EmptyState } from '@mister-guiiug/dev-pwa-config/react/empty-state';
import { ErrorBanner } from '@mister-guiiug/dev-pwa-config/react/error-banner';
import { SkeletonGroup } from '@mister-guiiug/dev-pwa-config/react/skeleton';
import { useToast } from '@mister-guiiug/dev-pwa-config/react/toast';
import { useActionGuard } from '@mister-guiiug/dev-pwa-config/react/use-action-guard';
import { useI18n } from '../../i18n/index.ts';
import { isRemote } from '../../backend/index.ts';
import type {
  Category,
  Expense,
  Group,
  Participant,
  Settlement,
  Space,
} from '../../backend/ports.ts';
import { expenseQueue } from '../../backend/sync.ts';
import { useSyncState } from '../../backend/sync-state.ts';
import { computeBalances } from '../../domain/balances.ts';
import { todayIso } from '../../domain/dates.ts';
import {
  calculationFingerprint,
  hasBlockingIssue,
} from '../../domain/expense.ts';
import {
  emptyForm,
  expenseInputFromLines,
  formFromExpense,
  impactOf,
  issuesOf,
  toPortInput,
  totalOf,
  type ExpenseForm,
  type FormContext,
} from '../../domain/expense-form.ts';
import { byPosition } from '../../domain/people.ts';
import { ErrorMessage } from '../../components/ErrorMessage.tsx';
import {
  can,
  useCurrentSpace,
  useMyUserId,
} from '../spaces/useCurrentSpace.ts';
import { usePeople, usePeopleOf } from '../people/store.ts';
import { clearDraft, readDraft, writeDraft } from './draft-store.ts';
import { StepSummary } from './StepSummary.tsx';
import { StepWhat } from './StepWhat.tsx';
import { StepWho } from './StepWho.tsx';
import { useExpenses, useExpensesOf } from './store.ts';

export type WizardMode = 'new' | 'edit' | 'split';
type Step = 1 | 2 | 3;
const STEP_KEYS = { 1: 'what', 2: 'who', 3: 'summary' } as const;
const soft = { color: 'var(--dwc-text-soft)' } as const;

/**
 * L'ASSISTANT D'UNE DÉPENSE, en trois pas : quoi et combien ; qui a payé,
 * pour qui ; synthèse et validation. Le même assistant crée, modifie,
 * duplique (`?depuis=`) et revalide (`/repartition`, qui ouvre au dernier
 * pas). L'écran charge ce qu'il faut, puis MONTE le formulaire d'un coup
 * (`key`) : ses champs naissent de la dépense — ou du brouillon local, pour
 * une dépense neuve (ADR 0015) — sans effet qui recopie.
 */
export function ExpenseWizardScreen({ mode }: { mode: WizardMode }) {
  const { t } = useI18n();
  const space = useCurrentSpace();
  const me = useMyUserId();
  const { expenseId } = useParams();
  const [searchParams] = useSearchParams();
  usePeopleOf(space?.id);
  useExpensesOf(space?.id);
  const participants = usePeople(state => state.participants);
  const groups = usePeople(state => state.groups);
  const peopleReady = usePeople(state => state.ready);
  const expenses = useExpenses(state => state.expenses);
  const categories = useExpenses(state => state.categories);
  const settlements = useExpenses(state => state.settlements);
  const expensesReady = useExpenses(state => state.ready);

  if (!space) return null;
  const listPath = `/e/${space.id}/depenses`;
  if (!peopleReady || !expensesReady) {
    return <SkeletonGroup label={t('expenses.loading')} lines={4} />;
  }
  const rights = can(space.myRole);
  const back = (
    <Link to={listPath} className="no-underline">
      <Button variant="outline">{t('expense.backToList')}</Button>
    </Link>
  );
  if (!rights.contribute || space.archivedAt) {
    return <EmptyState title={t('expense.contributorOnly')} action={back} />;
  }

  const active = participants.filter(p => !p.archivedAt).sort(byPosition);
  const ctx: FormContext = {
    orderedParticipantIds: active.map(p => p.id),
    groups: groups
      .filter(g => !g.archivedAt)
      .map(g => ({ id: g.id, memberIds: g.memberIds })),
    minorUnit: space.minorUnit,
  };
  const sourceId = mode === 'new' ? searchParams.get('depuis') : expenseId;
  const source = sourceId ? expenses.find(e => e.id === sourceId) : undefined;
  if (mode !== 'new' && !source) {
    return <EmptyState title={t('expense.notFound')} action={back} />;
  }
  const today = todayIso();
  const mine = active.find(p => p.linkedUserId === me) ?? active[0];
  const draft = mode === 'new' && !source ? readDraft(space.id) : null;
  const initial =
    draft ??
    (source
      ? formFromExpense(
          source,
          ctx,
          mode === 'new' ? { duplicate: true, today } : {}
        )
      : emptyForm({
          spaceId: space.id,
          currency: space.currency,
          today,
          payerId: mine?.id ?? null,
          participantIds: ctx.orderedParticipantIds,
        }));

  return (
    <Wizard
      key={source ? `${source.id}:${source.version}:${mode}` : 'new'}
      mode={mode}
      initial={initial}
      {...(mode !== 'new' && source ? { source } : {})}
      space={space}
      ctx={ctx}
      participants={active}
      groups={groups.filter(g => !g.archivedAt)}
      categories={categories}
      expenses={expenses}
      settlements={settlements}
    />
  );
}

function Wizard({
  mode,
  initial,
  source,
  space,
  ctx,
  participants,
  groups,
  categories,
  expenses,
  settlements,
}: {
  mode: WizardMode;
  initial: ExpenseForm;
  /** La dépense modifiée — absente pour une création ou une copie. */
  source?: Expense;
  space: Space;
  ctx: FormContext;
  participants: Participant[];
  groups: Group[];
  categories: Category[];
  expenses: Expense[];
  settlements: Settlement[];
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const toast = useToast();
  const save = useExpenses(state => state.save);
  const validate = useExpenses(state => state.validate);
  const error = useExpenses(state => state.error);
  const clearError = useExpenses(state => state.clearError);
  const online = useSyncState(state => state.online);
  // Valider est un geste SERVEUR (R9) : sans réseau, le bouton le dit au lieu
  // de se cacher (ADR 0015). Sur l'appareil seul, rien à attendre.
  const guard = useActionGuard({
    online: isRemote,
    offlineMessage: t('sync.needsNetwork'),
  });
  const [form, setFormState] = useState(initial);
  const [step, setStep] = useState<Step>(mode === 'split' ? 3 : 1);
  // D'où vient le pas affiché : l'animation d'entrée le lit pour glisser du
  // bon côté. C'est un état de RENDU (il doit être posé avant que le nouveau
  // pas ne s'affiche), pas une référence mise à jour après coup.
  const [direction, setDirection] = useState<'avant' | 'arriere'>('avant');
  const goToStep = (target: Step) => {
    setDirection(target > step ? 'avant' : 'arriere');
    setStep(target);
  };
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);

  const isNew = mode === 'new' && !source;
  const listPath = `/e/${space.id}/depenses`;
  // Une dépense neuve laisse un brouillon sur l'appareil à chaque frappe :
  // il survit à une coupure, un rechargement, une sortie (ADR 0015, 2).
  const setForm = (next: ExpenseForm) => {
    setFormState(next);
    if (isNew) writeDraft(next);
  };
  const total = totalOf(form, ctx);
  const step1Ok =
    form.label.trim() !== '' &&
    total !== null &&
    total > 0 &&
    form.spentOn !== '';
  const issues = issuesOf(form, ctx);
  const blocking = hasBlockingIssue(issues);

  // L'impact se mesure sur les soldes SANS cette dépense — qu'elle soit neuve
  // ou déjà validée : avant → après, c'est ce qu'elle change.
  const balances = computeBalances({
    participantIds: ctx.orderedParticipantIds,
    expenses: expenses.filter(
      e => e.status === 'validated' && e.id !== form.id
    ),
    settlements,
  });
  const impact = impactOf(form, ctx, balances);

  // Une dépense validée qu'on rouvre : l'EMPREINTE dit si la répartition
  // survit à l'enregistrement (ADR 0013) — même calcul que la base.
  const originalFingerprint =
    source && source.status === 'validated'
      ? calculationFingerprint(expenseInputFromLines(source))
      : null;
  const changed =
    originalFingerprint !== null &&
    calculationFingerprint(expenseInputFromLines(toPortInput(form, ctx))) !==
      originalFingerprint;

  // Sans réseau, une CRÉATION attend dans la file : identifiant engendré ici,
  // rejeu idempotent, une seule fois (ADR 0015, 3).
  const enqueue = () => {
    const input = toPortInput(form, ctx);
    const id = createUuid();
    const entry = expenseQueue().enqueue({
      input: { ...input, id },
      spaceId: space.id,
      label: input.label,
      form,
    });
    if (!entry) return false;
    clearDraft(space.id);
    toast.success(t('sync.queued'));
    void navigate(listPath, { replace: true });
    return true;
  };

  const persist = async (thenValidate: boolean) => {
    setBusy(true);
    clearError();
    if (isRemote && isNew && !online && !thenValidate) {
      enqueue();
      setBusy(false);
      return;
    }
    const result = await save(
      toPortInput(form, ctx),
      source ? source.version : null
    );
    if (!result) {
      // Le réseau est tombé entre-temps : la création rejoint la file.
      const failure = useExpenses.getState().error;
      if (isRemote && isNew && !thenValidate && failure?.code === 'network') {
        clearError();
        enqueue();
      }
      setBusy(false);
      return;
    }
    if (isNew) clearDraft(space.id);
    if (thenValidate) {
      const validated = await validate(result.id, result.version);
      setBusy(false);
      if (!validated) return;
      toast.success(t('wizard.validated'));
    } else {
      setBusy(false);
      toast.success(t('wizard.saved'));
    }
    void navigate(`${listPath}/${result.id}`, { replace: true });
  };

  const next = () => {
    if (step === 1) {
      if (!step1Ok) {
        setTouched(true);
        return;
      }
      goToStep(2);
    } else if (step === 2) {
      goToStep(3);
    }
  };
  const previous = () => goToStep(step === 3 ? 2 : 1);
  const cancelHref = source ? `${listPath}/${source.id}` : listPath;
  const cancel = () => {
    if (isNew) clearDraft(space.id);
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 text-sm" style={soft}>
        {t('wizard.step', {
          n: step,
          name: t(`wizard.steps.${STEP_KEYS[step]}`),
        })}
      </p>

      {/*
        LE PAS GLISSE DU CÔTÉ D'OÙ IL VIENT. La `key` fait renaître l'élément à
        chaque changement de pas, ce qui (re)part l'animation CSS ; `data-sens`
        lui dit de quel côté. Le formulaire, lui, vit dans cet écran-ci : rien
        n'est perdu au remplacement.
      */}
      <div key={step} className="settle-pas" data-sens={direction}>
        {step === 1 ? (
          <StepWhat
            form={form}
            setForm={setForm}
            space={space}
            categories={categories}
            touched={touched}
          />
        ) : step === 2 ? (
          <StepWho
            form={form}
            setForm={setForm}
            ctx={ctx}
            space={space}
            participants={participants}
            groups={groups}
          />
        ) : (
          <StepSummary
            form={form}
            ctx={ctx}
            space={space}
            participants={participants}
            groups={groups}
            categories={categories}
            issues={issues}
            impact={impact}
            validationChanged={originalFingerprint === null ? null : changed}
          />
        )}
      </div>

      {error ? <ErrorBanner message={<ErrorMessage error={error} />} /> : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        {step > 1 ? (
          <Button variant="outline" onClick={previous}>
            {t('wizard.back')}
          </Button>
        ) : (
          <Link to={cancelHref} className="no-underline" onClick={cancel}>
            <Button variant="ghost">{t('wizard.cancel')}</Button>
          </Link>
        )}
        {step < 3 ? (
          <Button variant="primary" onClick={next}>
            {t('wizard.next')}
          </Button>
        ) : (
          <div className="flex flex-col items-end gap-1">
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                loading={busy}
                onClick={() => void persist(false)}
              >
                {t('wizard.saveDraft')}
              </Button>
              <Button
                variant="primary"
                loading={busy}
                aria-disabled={blocking || guard.disabled}
                onClick={() => {
                  if (!blocking && guard.allowed) void persist(true);
                }}
              >
                {t('wizard.validate')}
              </Button>
            </div>
            {!guard.allowed && guard.reason ? (
              <p className="m-0 text-xs" style={soft}>
                {guard.reason}
              </p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
