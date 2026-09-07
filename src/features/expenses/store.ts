import { useEffect } from 'react';
import { create } from 'zustand';
import { createLogger } from '@mister-guiiug/dev-pwa-config/logger';
import { backend } from '../../backend/index.ts';
import type {
  Category,
  CategoryInput,
  Expense,
  ExpenseInput,
  Revision,
  SaveResult,
  Settlement,
  SettlementInput,
} from '../../backend/ports.ts';
import { toUiError, type UiError } from '../spaces/store.ts';

const log = createLogger('depenses');

interface ExpensesState {
  spaceId: string | null;
  expenses: Expense[];
  categories: Category[];
  /** Les remboursements déclarés : les soldes ne se lisent pas sans eux. */
  settlements: Settlement[];
  ready: boolean;
  error: UiError | null;
  load: (spaceId: string) => Promise<void>;
  /** Relit UNE dépense après une écriture, et la remet à sa place. */
  refresh: (id: string) => Promise<Expense | null>;
  save: (
    input: ExpenseInput,
    expectedVersion: number | null
  ) => Promise<SaveResult | null>;
  validate: (id: string, expectedVersion: number) => Promise<SaveResult | null>;
  archive: (
    id: string,
    archived: boolean,
    expectedVersion: number
  ) => Promise<SaveResult | null>;
  remove: (id: string) => Promise<boolean>;
  revisions: (id: string) => Promise<Revision[]>;
  createCategory: (input: CategoryInput) => Promise<Category | null>;
  archiveCategory: (id: string, archived: boolean) => Promise<boolean>;
  /** Déclarer un remboursement : une note partagée, jamais un transfert. */
  recordSettlement: (input: SettlementInput) => Promise<Settlement | null>;
  cancelSettlement: (
    id: string,
    expectedVersion: number
  ) => Promise<Settlement | null>;
  clearError: () => void;
}

/**
 * LES DÉPENSES D'UN ESPACE, avec ce qu'il faut pour les lire : les catégories
 * (le catalogue commun, puis celles de l'espace) et les remboursements
 * déclarés. Même contrat que les autres magasins : le PORT décide, la version
 * attendue accompagne chaque écriture, et une écriture réussie est SUIVIE
 * D'UNE RELECTURE de la ligne — c'est la base qui dit le statut, l'empreinte,
 * les allocations (ADR 0013), pas l'écran.
 */
export const useExpenses = create<ExpensesState>((set, get) => {
  const attempt = async <T>(
    what: string,
    run: () => Promise<T>
  ): Promise<T | null> => {
    try {
      const result = await run();
      set({ error: null });
      return result;
    } catch (cause) {
      log.error(what, { cause });
      set({ error: toUiError(cause) });
      return null;
    }
  };

  const refresh = async (id: string): Promise<Expense | null> => {
    const expense = await attempt('relecture d’une dépense', () =>
      backend.expenses.get(id)
    );
    if (!expense) return null;
    const known = get().expenses.some(e => e.id === id);
    set({
      expenses: known
        ? get().expenses.map(e => (e.id === id ? expense : e))
        : [expense, ...get().expenses],
    });
    return expense;
  };

  return {
    spaceId: null,
    expenses: [],
    categories: [],
    settlements: [],
    ready: false,
    error: null,

    async load(spaceId) {
      if (get().spaceId !== spaceId) {
        set({
          spaceId,
          expenses: [],
          categories: [],
          settlements: [],
          ready: false,
          error: null,
        });
      }
      try {
        const [expenses, categories, settlements] = await Promise.all([
          backend.expenses.list(spaceId, { status: 'all' }),
          backend.categories.list(spaceId),
          backend.settlements.list(spaceId),
        ]);
        if (get().spaceId !== spaceId) return;
        set({ expenses, categories, settlements, ready: true, error: null });
      } catch (cause) {
        log.error('lecture des dépenses', { cause });
        set({ ready: true, error: toUiError(cause) });
      }
    },

    refresh,

    async save(input, expectedVersion) {
      const result = await attempt('enregistrement d’une dépense', () =>
        backend.expenses.save(input, expectedVersion)
      );
      if (result) await refresh(result.id);
      return result;
    },

    async validate(id, expectedVersion) {
      const result = await attempt('validation d’une répartition', () =>
        backend.expenses.validate(id, expectedVersion)
      );
      if (result) await refresh(id);
      return result;
    },

    async archive(id, archived, expectedVersion) {
      const result = await attempt('archivage d’une dépense', () =>
        backend.expenses.archive(id, archived, expectedVersion)
      );
      if (result) await refresh(id);
      return result;
    },

    async remove(id) {
      const before = get().expenses;
      set({ expenses: before.filter(e => e.id !== id) });
      const done = await attempt('suppression d’un brouillon', () =>
        backend.expenses.remove(id)
      );
      if (done === null) set({ expenses: before });
      return done !== null;
    },

    async revisions(id) {
      const list = await attempt('lecture de l’historique', () =>
        backend.expenses.revisions(id)
      );
      return list ?? [];
    },

    async createCategory(input) {
      const category = await attempt('création d’une catégorie', () =>
        backend.categories.create(input)
      );
      if (category) set({ categories: [...get().categories, category] });
      return category;
    },

    async archiveCategory(id, archived) {
      const done = await attempt('archivage d’une catégorie', () =>
        backend.categories.archive(id, archived)
      );
      if (done === null) return false;
      const spaceId = get().spaceId;
      if (spaceId) {
        const categories = await attempt('relecture des catégories', () =>
          backend.categories.list(spaceId)
        );
        if (categories) set({ categories });
      }
      return true;
    },

    async recordSettlement(input) {
      const settlement = await attempt('déclaration d’un remboursement', () =>
        backend.settlements.record(input)
      );
      if (settlement) set({ settlements: [settlement, ...get().settlements] });
      return settlement;
    },

    async cancelSettlement(id, expectedVersion) {
      const settlement = await attempt('annulation d’un remboursement', () =>
        backend.settlements.cancel(id, expectedVersion)
      );
      if (settlement) {
        set({
          settlements: get().settlements.map(s =>
            s.id === settlement.id ? settlement : s
          ),
        });
      }
      return settlement;
    },

    clearError() {
      set({ error: null });
    },
  };
});

/** Charge les dépenses de l'espace au montage, et à chaque changement d'espace. */
export function useExpensesOf(spaceId: string | undefined): void {
  const load = useExpenses(state => state.load);
  useEffect(() => {
    if (spaceId) void load(spaceId);
  }, [spaceId, load]);
}
