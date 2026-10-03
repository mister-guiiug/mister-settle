import { describe, expect, it } from 'vitest';
import type { Participant } from '../../backend/ports.ts';
import { spaceSummaryOf } from './space-summary.ts';

const alice: Participant = {
  id: '11111111-1111-4111-8111-111111111111',
  spaceId: '22222222-2222-4222-8222-222222222222',
  displayName: 'Alice',
  initials: 'A',
  avatarColor: '',
  email: null,
  position: 0,
  archivedAt: null,
  version: 1,
  linkedUserId: 'user-alice',
};

const bob: Participant = {
  ...alice,
  id: '33333333-3333-4333-8333-333333333333',
  displayName: 'Bob',
  initials: 'B',
  position: 1,
  linkedUserId: null,
};

describe('spaceSummaryOf', () => {
  it('calcule mon solde, les brouillons et la dernière activité', () => {
    const summary = spaceSummaryOf({
      participants: [alice, bob],
      expenses: [
        {
          status: 'validated',
          spentOn: '2026-03-02',
          payers: [{ participantId: alice.id, amount: 2000 }],
          allocations: [
            { participantId: alice.id, amount: 1000 },
            { participantId: bob.id, amount: 1000 },
          ],
        },
        {
          status: 'draft',
          spentOn: '2026-03-03',
          payers: [{ participantId: alice.id, amount: 1000 }],
          allocations: [],
        },
      ],
      settlements: [],
      myUserId: 'user-alice',
    });
    expect(summary.drafts).toBe(1);
    expect(summary.lastSpentOn).toBe('2026-03-03');
    expect(summary.myNet).toBe(1000);
  });

  it('rend myNet null si je ne suis rattaché·e à personne', () => {
    const summary = spaceSummaryOf({
      participants: [alice, bob],
      expenses: [],
      settlements: [],
      myUserId: 'inconnu',
    });
    expect(summary.myNet).toBeNull();
  });
});
