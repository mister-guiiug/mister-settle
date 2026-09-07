import { beforeEach, describe, expect, it } from 'vitest';
import { createStore } from '@mister-guiiug/dev-pwa-config/storage';
import { createExpenseQueue, shouldRetry, type QueuedExpense } from './sync.ts';
import { BackendError, type ExpenseInput } from './ports.ts';

const ID = '00000000-0000-4000-8000-0000000000e1';
const SPACE = '00000000-0000-4000-8000-000000000001';
const A = '00000000-0000-4000-8000-00000000000a';

const payload = (): QueuedExpense => ({
  input: {
    id: ID,
    spaceId: SPACE,
    label: 'Restaurant',
    amount: 3000,
    currency: 'EUR',
    spentOn: '2026-09-01',
    splitMethod: 'equal',
    payers: [{ participantId: A, amount: 3000 }],
    beneficiaries: [{ participantId: A, position: 0 }],
  },
  spaceId: SPACE,
  label: 'Restaurant',
  form: null,
});

beforeEach(() => {
  localStorage.clear();
});

describe('shouldRetry', () => {
  it('ne réessaie que ce que le réseau a empêché', () => {
    expect(shouldRetry(new BackendError('network', 'coupé'))).toBe(true);
    expect(shouldRetry(new BackendError('conflict', 'périmé'))).toBe(false);
    expect(shouldRetry(new BackendError('forbidden', 'non'))).toBe(false);
    expect(shouldRetry(new Error('autre'))).toBe(false);
  });
});

describe('createExpenseQueue', () => {
  it('rejoue la création au retour du réseau, une fois, par son identifiant', async () => {
    const saved: ExpenseInput[] = [];
    let online = false;
    const statuses: Array<{ pending: number; dead: number }> = [];
    const queue = createExpenseQueue({
      store: createStore('test-sync'),
      isOnline: () => online,
      onChange: status => statuses.push(status),
      save: async input => {
        if (!online) throw new BackendError('network', 'coupé');
        saved.push(input);
        return { id: ID, version: 1, status: 'draft' };
      },
    });
    expect(queue.enqueue(payload())).not.toBeNull();
    // La même clé d'entité fusionne : une seule entrée pour un même rejeu.
    queue.enqueue(payload());
    expect(queue.pending()).toBe(1);

    await queue.flush();
    expect(saved).toHaveLength(0);
    expect(queue.pending()).toBe(1);

    online = true;
    await queue.flush();
    expect(saved).toHaveLength(1);
    expect(saved[0]?.id).toBe(ID);
    expect(queue.pending()).toBe(0);
    expect(statuses.at(-1)).toEqual({ pending: 0, dead: 0 });
  });

  it('range un refus définitif en lettre morte, sans le rejouer', async () => {
    let attempts = 0;
    const queue = createExpenseQueue({
      store: createStore('test-sync-dead'),
      isOnline: () => true,
      save: async () => {
        attempts += 1;
        throw new BackendError('conflict', 'version périmée');
      },
    });
    queue.enqueue(payload());
    await queue.flush();
    expect(attempts).toBe(1);
    expect(queue.pending()).toBe(0);
    expect(queue.deadLetters()).toHaveLength(1);
    expect(queue.deadLetters()[0]?.payload.label).toBe('Restaurant');
  });
});
