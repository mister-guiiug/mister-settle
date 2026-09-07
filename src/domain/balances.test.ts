import { describe, expect, it } from 'vitest';
import {
  balanceSum,
  computeBalances,
  consolidateByGroup,
  type ExpenseForBalance,
  type SettlementForBalance,
} from './balances.ts';
import { suggestTransfers } from './settle.ts';

/**
 * Le scénario du cahier des charges : Alice paie 90 € pour Alice, Bob et
 * Charlie. Puis Bob rembourse 30 €, hors de l'application, et le déclare.
 */
const alicePays: ExpenseForBalance = {
  status: 'validated',
  payers: [{ participantId: 'alice', amount: 9000 }],
  allocations: [
    { participantId: 'alice', amount: 3000 },
    { participantId: 'bob', amount: 3000 },
    { participantId: 'charlie', amount: 3000 },
  ],
};

const brouillon: ExpenseForBalance = {
  ...alicePays,
  status: 'draft',
};

const bobRembourse: SettlementForBalance = {
  status: 'recorded',
  fromParticipantId: 'bob',
  toParticipantId: 'alice',
  amount: 3000,
};

describe('computeBalances', () => {
  it('calcule payé, dû et net, à somme nulle', () => {
    const lines = computeBalances({
      participantIds: ['alice', 'bob', 'charlie'],
      expenses: [alicePays],
      settlements: [],
    });
    expect(lines).toEqual([
      {
        participantId: 'alice',
        paid: 9000,
        owed: 3000,
        sent: 0,
        received: 0,
        net: 6000,
      },
      {
        participantId: 'bob',
        paid: 0,
        owed: 3000,
        sent: 0,
        received: 0,
        net: -3000,
      },
      {
        participantId: 'charlie',
        paid: 0,
        owed: 3000,
        sent: 0,
        received: 0,
        net: -3000,
      },
    ]);
    expect(balanceSum(lines)).toBe(0);
  });

  it('ignore les brouillons — ils n’existent pas pour les soldes', () => {
    const lines = computeBalances({
      participantIds: ['alice', 'bob', 'charlie'],
      expenses: [brouillon],
      settlements: [],
    });
    expect(lines.every(l => l.net === 0)).toBe(true);
  });

  it('applique un remboursement enregistré, pas un remboursement annulé', () => {
    const lines = computeBalances({
      participantIds: ['alice', 'bob', 'charlie'],
      expenses: [alicePays],
      settlements: [bobRembourse, { ...bobRembourse, status: 'cancelled' }],
    });
    const byId = new Map(lines.map(l => [l.participantId, l]));
    expect(byId.get('bob')?.net).toBe(0);
    expect(byId.get('bob')?.sent).toBe(3000);
    expect(byId.get('alice')?.net).toBe(3000);
    expect(byId.get('alice')?.received).toBe(3000);
    expect(balanceSum(lines)).toBe(0);
  });

  it('garde les montants d’une personne absente de la liste donnée', () => {
    const lines = computeBalances({
      participantIds: ['alice'],
      expenses: [alicePays],
      settlements: [],
    });
    expect(lines.map(l => l.participantId)).toEqual([
      'alice',
      'bob',
      'charlie',
    ]);
    expect(balanceSum(lines)).toBe(0);
  });
});

describe('consolidateByGroup', () => {
  it('additionne les membres et garde le détail dessous', () => {
    const lines = computeBalances({
      participantIds: ['alice', 'bob', 'charlie'],
      expenses: [alicePays],
      settlements: [],
    });
    const [enfants] = consolidateByGroup(lines, [
      { id: 'enfants', memberIds: ['bob', 'charlie'] },
    ]);
    expect(enfants?.net).toBe(-6000);
    expect(enfants?.owed).toBe(6000);
    expect(enfants?.members.map(m => m.participantId)).toEqual([
      'bob',
      'charlie',
    ]);
  });
});

describe('suggestTransfers', () => {
  it('propose à Bob et Charlie de rendre 30 € à Alice, dans un ordre stable', () => {
    const lines = computeBalances({
      participantIds: ['alice', 'bob', 'charlie'],
      expenses: [alicePays],
      settlements: [],
    });
    expect(suggestTransfers(lines)).toEqual([
      { fromParticipantId: 'bob', toParticipantId: 'alice', amount: 3000 },
      { fromParticipantId: 'charlie', toParticipantId: 'alice', amount: 3000 },
    ]);
  });

  it('ne propose rien quand tout est soldé', () => {
    const lines = computeBalances({
      participantIds: ['alice', 'bob'],
      expenses: [],
      settlements: [],
    });
    expect(suggestTransfers(lines)).toEqual([]);
  });

  it('solde chaque personne en au plus n − 1 opérations, sur un échantillon', () => {
    let seed = 99;
    const next = () => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      return seed;
    };
    for (let round = 0; round < 200; round += 1) {
      const count = 2 + (next() % 7);
      const ids = Array.from({ length: count }, (_, i) => `p${i}`);
      // Des soldes aléatoires ramenés à somme nulle par le dernier.
      const nets = ids.map(() => (next() % 20_001) - 10_000);
      const sum = nets.reduce((s, n) => s + n, 0);
      nets[nets.length - 1] = (nets[nets.length - 1] ?? 0) - sum;
      const lines = ids.map((participantId, i) => ({
        participantId,
        paid: 0,
        owed: 0,
        sent: 0,
        received: 0,
        net: nets[i] ?? 0,
      }));

      const transfers = suggestTransfers(lines);
      expect(transfers.length).toBeLessThanOrEqual(count - 1);
      const after = new Map(lines.map(l => [l.participantId, l.net]));
      for (const t of transfers) {
        expect(t.amount).toBeGreaterThan(0);
        after.set(
          t.fromParticipantId,
          (after.get(t.fromParticipantId) ?? 0) + t.amount
        );
        after.set(
          t.toParticipantId,
          (after.get(t.toParticipantId) ?? 0) - t.amount
        );
      }
      for (const net of after.values()) expect(net).toBe(0);
    }
  });
});
