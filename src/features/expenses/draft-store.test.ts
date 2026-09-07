import { beforeEach, describe, expect, it } from 'vitest';
import { emptyForm } from '../../domain/expense-form.ts';
import {
  clearDraft,
  isBlankDraft,
  readDraft,
  writeDraft,
} from './draft-store.ts';

const SPACE = '00000000-0000-4000-8000-000000000001';
const A = '00000000-0000-4000-8000-00000000000a';

const fresh = () =>
  emptyForm({
    spaceId: SPACE,
    currency: 'EUR',
    today: '2026-09-07',
    payerId: A,
    participantIds: [A],
  });

beforeEach(() => {
  localStorage.clear();
});

describe('brouillon local', () => {
  it('survit, se relit, et s’efface', () => {
    const form = { ...fresh(), label: 'Restaurant', amountText: '30' };
    writeDraft(form);
    expect(readDraft(SPACE)).toEqual(form);
    clearDraft(SPACE);
    expect(readDraft(SPACE)).toBeNull();
  });

  it('ne garde jamais la modification d’une dépense existante', () => {
    writeDraft({ ...fresh(), id: '00000000-0000-4000-8000-0000000000e1' });
    expect(readDraft(SPACE)).toBeNull();
  });

  it('ignore une copie qui ne se relit plus', () => {
    localStorage.setItem(`settle_draft_${SPACE}`, JSON.stringify({ x: 1 }));
    expect(readDraft(SPACE)).toBeNull();
  });

  it('sait quand il n’y a rien dedans', () => {
    expect(isBlankDraft(fresh())).toBe(true);
    expect(isBlankDraft({ ...fresh(), label: 'x' })).toBe(false);
  });
});
