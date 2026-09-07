import { z } from 'zod';
import {
  readJson,
  removeKey,
  writeJson,
} from '@mister-guiiug/dev-pwa-config/storage';
import type { ExpenseForm } from '../../domain/expense-form.ts';

/**
 * LE BROUILLON LOCAL D'UNE DÉPENSE (ADR 0015, 2) : ce qu'on tape dans
 * l'assistant survit à un rechargement, à une coupure, à une sortie — sur
 * l'appareil, sans partir nulle part, sans compter dans aucun solde. Un
 * brouillon par espace, et seulement pour une dépense NEUVE : rouvrir une
 * dépense existante repart toujours de ce qui est écrit.
 */
const formSchema = z.object({
  id: z.null(),
  spaceId: z.string(),
  label: z.string(),
  amountText: z.string(),
  currency: z.string(),
  spentOn: z.string(),
  categoryId: z.string().nullable(),
  subcategoryId: z.string().nullable(),
  note: z.string(),
  payerMode: z.enum(['single', 'multi']),
  singlePayerId: z.string().nullable(),
  payerTexts: z.record(z.string(), z.string()),
  directIds: z.array(z.string()),
  selectedGroupIds: z.array(z.string()),
  excludedIds: z.array(z.string()),
  splitMethod: z.enum(['equal', 'amount', 'shares']),
  amountTexts: z.record(z.string(), z.string()),
  sharesTexts: z.record(z.string(), z.string()),
});

const keyOf = (spaceId: string) => `settle_draft_${spaceId}`;

/** Le brouillon d'un espace, s'il y en a un et qu'il se relit encore. */
export function readDraft(spaceId: string): ExpenseForm | null {
  const raw = readJson<unknown>(keyOf(spaceId), null);
  const parsed = formSchema.safeParse(raw);
  return parsed.success && parsed.data.spaceId === spaceId ? parsed.data : null;
}

export function writeDraft(form: ExpenseForm): void {
  if (form.id !== null) return;
  writeJson(keyOf(form.spaceId), form);
}

export function clearDraft(spaceId: string): void {
  removeKey(keyOf(spaceId));
}

/** Un brouillon est « vide » quand rien de ce qu'on tape n'y est encore. */
export function isBlankDraft(form: ExpenseForm): boolean {
  return (
    form.label.trim() === '' &&
    form.amountText.trim() === '' &&
    form.note.trim() === ''
  );
}
