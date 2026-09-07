import { beforeEach, describe, expect, it } from 'vitest';
import { LOCAL_USER_ID, createLocalBackend, localDb } from './local.ts';
import type { Backend, ExpenseInput, Space } from './ports.ts';
import { SHARES_SCALE } from '../domain/money.ts';

/**
 * LE CONTRAT DES PORTS, éprouvé sur l'adaptateur local — sans rien simuler :
 * magasin versionné réel, validation Zod, domaine réel. Ce que ces tests
 * figent est le miroir exact de `supabase/tests/repartition.test.sql` et
 * `espaces.test.sql` : une dépense qui passe ici passe là-bas, et les refus
 * portent les mêmes motifs.
 */
let backend: Backend;

beforeEach(() => {
  localStorage.clear();
  localDb.clear();
  backend = createLocalBackend();
});

async function espaceAvecTrois(): Promise<{
  space: Space;
  anne: string;
  ben: string;
  cleo: string;
}> {
  const space = await backend.spaces.create({
    name: 'Colocation',
    currency: 'EUR',
    meName: 'Alice',
  });
  const anne = (
    await backend.participants.create({
      spaceId: space.id,
      displayName: 'Anne',
      position: 10,
    })
  ).id;
  const ben = (
    await backend.participants.create({
      spaceId: space.id,
      displayName: 'Ben',
      position: 20,
    })
  ).id;
  const cleo = (
    await backend.participants.create({
      spaceId: space.id,
      displayName: 'Cléo',
      position: 30,
    })
  ).id;
  return { space, anne, ben, cleo };
}

function centEurosATrois(
  spaceId: string,
  ids: { anne: string; ben: string; cleo: string },
  overrides: Partial<ExpenseInput> = {}
): ExpenseInput {
  return {
    id: '0d000000-0000-4000-8000-000000000001',
    spaceId,
    label: 'Restaurant',
    amount: 10000,
    currency: 'EUR',
    spentOn: '2026-09-07',
    splitMethod: 'equal',
    payers: [{ participantId: ids.anne, amount: 10000 }],
    beneficiaries: [
      { participantId: ids.cleo, position: 30 },
      { participantId: ids.anne, position: 10 },
      { participantId: ids.ben, position: 20 },
    ],
    ...overrides,
  };
}

describe('espaces', () => {
  it('crée l’espace, son propriétaire et sa personne rattachée', async () => {
    const space = await backend.spaces.create({
      name: 'Bretagne',
      currency: 'eur',
      meName: 'Alice',
    });
    expect(space.currency).toBe('EUR');
    expect(space.minorUnit).toBe(2);
    expect(space.myRole).toBe('owner');

    const people = await backend.participants.list(space.id);
    expect(people).toHaveLength(1);
    expect(people[0]?.displayName).toBe('Alice');
    expect(people[0]?.linkedUserId).toBe(LOCAL_USER_ID);
    expect(await backend.spaces.list()).toHaveLength(1);
  });

  it('déduit les décimales de la devise', async () => {
    const yen = await backend.spaces.create({ name: 'Tokyo', currency: 'JPY' });
    expect(yen.minorUnit).toBe(0);
  });

  it('refuse une écriture sur une version périmée', async () => {
    const space = await backend.spaces.create({
      name: 'À renommer',
      currency: 'EUR',
    });
    await backend.spaces.update(space.id, { name: 'Renommé' }, space.version);
    await expect(
      backend.spaces.update(space.id, { name: 'Encore' }, space.version)
    ).rejects.toMatchObject({
      code: 'conflict',
    });
  });

  it('supprime tout ce qui appartient à l’espace, et rien d’autre', async () => {
    const { space, anne, ben, cleo } = await espaceAvecTrois();
    const autre = await backend.spaces.create({
      name: 'Autre',
      currency: 'EUR',
    });
    await backend.expenses.save(
      centEurosATrois(space.id, { anne, ben, cleo }),
      null
    );
    await backend.spaces.remove(space.id);

    expect((await backend.spaces.list()).map(s => s.id)).toEqual([autre.id]);
    expect(await backend.participants.list(space.id)).toEqual([]);
    expect(await backend.expenses.list(space.id)).toEqual([]);
    expect(await backend.participants.list(autre.id)).toHaveLength(1);
  });

  it('refuse deux personnes actives du même nom', async () => {
    const { space } = await espaceAvecTrois();
    await expect(
      backend.participants.create({ spaceId: space.id, displayName: 'anne' })
    ).rejects.toMatchObject({
      code: 'invalid',
      detail: 'duplicate-name',
    });
  });

  it('sans compte, les invitations disent « mode local »', async () => {
    const { space } = await espaceAvecTrois();
    await expect(
      backend.invitations.create({ spaceId: space.id })
    ).rejects.toMatchObject({ code: 'local-mode' });
  });
});

describe('dépenses', () => {
  it('équitable : 100 € à trois → 33,34 · 33,33 · 33,33, par ordre stable', async () => {
    const { space, anne, ben, cleo } = await espaceAvecTrois();
    const saved = await backend.expenses.save(
      centEurosATrois(space.id, { anne, ben, cleo }),
      null
    );
    expect(saved).toMatchObject({ status: 'draft', version: 1 });

    const validated = await backend.expenses.validate(saved.id, 1);
    expect(validated).toMatchObject({ status: 'validated', version: 2 });

    const expense = await backend.expenses.get(saved.id);
    expect(expense?.allocations).toEqual([
      { participantId: anne, amount: 3334 },
      { participantId: ben, amount: 3333 },
      { participantId: cleo, amount: 3333 },
    ]);
    expect(expense?.validatedAt).not.toBeNull();
    expect(await backend.expenses.revisions(saved.id)).toHaveLength(2);
  });

  it('par parts décimales : 10 € en 1,5 contre 1 → 6 et 4', async () => {
    const { space, anne, ben, cleo } = await espaceAvecTrois();
    const saved = await backend.expenses.save(
      centEurosATrois(
        space.id,
        { anne, ben, cleo },
        {
          amount: 1000,
          payers: [{ participantId: anne, amount: 1000 }],
          splitMethod: 'shares',
          beneficiaries: [
            { participantId: anne, position: 10, shares: 1.5 * SHARES_SCALE },
            { participantId: ben, position: 20, shares: SHARES_SCALE },
          ],
        }
      ),
      null
    );
    await backend.expenses.validate(saved.id, 1);
    expect(
      (await backend.expenses.get(saved.id))?.allocations.map(a => a.amount)
    ).toEqual([600, 400]);
  });

  it('par montant : une somme fausse est refusée avec son motif', async () => {
    const { space, anne, ben, cleo } = await espaceAvecTrois();
    const saved = await backend.expenses.save(
      centEurosATrois(
        space.id,
        { anne, ben, cleo },
        {
          amount: 9000,
          payers: [{ participantId: anne, amount: 9000 }],
          splitMethod: 'amount',
          beneficiaries: [
            { participantId: anne, position: 10, amountInput: 4000 },
            { participantId: ben, position: 20, amountInput: 3000 },
            { participantId: cleo, position: 30, amountInput: 1000 },
          ],
        }
      ),
      null
    );
    await expect(backend.expenses.validate(saved.id, 1)).rejects.toMatchObject({
      code: 'invalid',
      detail: 'amounts-sum-mismatch',
    });
    expect((await backend.expenses.get(saved.id))?.status).toBe('draft');
  });

  it('plusieurs payeurs : 50 + 30 ≠ 90 est refusé', async () => {
    const { space, anne, ben, cleo } = await espaceAvecTrois();
    const saved = await backend.expenses.save(
      centEurosATrois(
        space.id,
        { anne, ben, cleo },
        {
          amount: 9000,
          payers: [
            { participantId: anne, amount: 5000 },
            { participantId: ben, amount: 3000 },
          ],
        }
      ),
      null
    );
    await expect(backend.expenses.validate(saved.id, 1)).rejects.toMatchObject({
      detail: 'payers-sum-mismatch',
    });
  });

  it('valider ou enregistrer sur une version périmée est un conflit', async () => {
    const { space, anne, ben, cleo } = await espaceAvecTrois();
    const input = centEurosATrois(space.id, { anne, ben, cleo });
    const saved = await backend.expenses.save(input, null);
    await backend.expenses.validate(saved.id, 1);
    await expect(backend.expenses.validate(saved.id, 1)).rejects.toMatchObject({
      code: 'conflict',
    });
    await expect(backend.expenses.save(input, 1)).rejects.toMatchObject({
      code: 'conflict',
    });
  });

  it('renommer garde la validation ; changer le montant la fait tomber', async () => {
    const { space, anne, ben, cleo } = await espaceAvecTrois();
    const input = centEurosATrois(space.id, { anne, ben, cleo });
    const saved = await backend.expenses.save(input, null);
    await backend.expenses.validate(saved.id, 1);

    const renamed = await backend.expenses.save(
      { ...input, label: 'Restaurant du port', note: 'anniversaire' },
      2
    );
    expect(renamed).toMatchObject({ status: 'validated', version: 3 });
    expect((await backend.expenses.get(saved.id))?.allocations).toHaveLength(3);

    const changed = await backend.expenses.save(
      {
        ...input,
        amount: 9000,
        payers: [{ participantId: anne, amount: 9000 }],
      },
      3
    );
    expect(changed).toMatchObject({ status: 'draft', version: 4 });
    const expense = await backend.expenses.get(saved.id);
    expect(expense?.allocations).toEqual([]);
    expect(expense?.validatedAt).toBeNull();
  });

  it('fige la composition d’un regroupement sur la dépense validée', async () => {
    const { space, anne, ben, cleo } = await espaceAvecTrois();
    const famille = await backend.groups.create({
      spaceId: space.id,
      name: 'Famille',
      memberIds: [anne, ben],
    });
    const saved = await backend.expenses.save(
      centEurosATrois(
        space.id,
        { anne, ben, cleo },
        {
          amount: 5000,
          payers: [{ participantId: anne, amount: 5000 }],
          selectedGroupIds: [famille.id],
          beneficiaries: [
            { participantId: anne, position: 10, viaGroupId: famille.id },
            { participantId: ben, position: 20, viaGroupId: famille.id },
          ],
        }
      ),
      null
    );
    await backend.expenses.validate(saved.id, 1);
    expect((await backend.expenses.get(saved.id))?.groupSnapshots).toEqual([
      {
        groupId: famille.id,
        groupName: 'Famille',
        memberParticipantIds: [anne, ben].sort(),
      },
    ]);

    await backend.groups.update(
      famille.id,
      { memberIds: [anne] },
      famille.version
    );
    expect(
      (await backend.expenses.get(saved.id))?.groupSnapshots[0]
        ?.memberParticipantIds
    ).toHaveLength(2);
    await backend.groups.remove(famille.id);
    expect((await backend.expenses.get(saved.id))?.allocations).toHaveLength(2);
  });

  it('refuse une personne d’un autre espace, et un brouillon seul se supprime', async () => {
    const { space, anne, ben, cleo } = await espaceAvecTrois();
    const autre = await backend.spaces.create({
      name: 'Autre',
      currency: 'EUR',
    });
    const etranger = (await backend.participants.list(autre.id))[0]?.id ?? '';
    await expect(
      backend.expenses.save(
        centEurosATrois(
          space.id,
          { anne, ben, cleo },
          { payers: [{ participantId: etranger, amount: 10000 }] }
        ),
        null
      )
    ).rejects.toMatchObject({ detail: 'foreign-participant' });

    const saved = await backend.expenses.save(
      centEurosATrois(space.id, { anne, ben, cleo }),
      null
    );
    await backend.expenses.validate(saved.id, 1);
    await expect(backend.expenses.remove(saved.id)).rejects.toMatchObject({
      detail: 'not-a-draft',
    });
    await backend.expenses.save(
      centEurosATrois(
        space.id,
        { anne, ben, cleo },
        { id: '0d000000-0000-4000-8000-000000000002' }
      ),
      null
    );
    await backend.expenses.remove('0d000000-0000-4000-8000-000000000002');
    expect(await backend.expenses.list(space.id)).toHaveLength(1);
  });
});

describe('remboursements', () => {
  it('se déclarent, se listent, s’annulent avec la version en garde', async () => {
    const { space, anne, ben } = await espaceAvecTrois();
    const settlement = await backend.settlements.record({
      spaceId: space.id,
      fromParticipantId: ben,
      toParticipantId: anne,
      amount: 3000,
      settledOn: '2026-09-07',
    });
    expect(settlement).toMatchObject({
      status: 'recorded',
      currency: 'EUR',
      createdBy: LOCAL_USER_ID,
    });
    expect(await backend.settlements.list(space.id)).toHaveLength(1);

    const cancelled = await backend.settlements.cancel(
      settlement.id,
      settlement.version
    );
    expect(cancelled.status).toBe('cancelled');
    await expect(
      backend.settlements.cancel(settlement.id, settlement.version)
    ).rejects.toMatchObject({ code: 'conflict' });
  });

  it('refuse un remboursement à soi-même', async () => {
    const { space, anne } = await espaceAvecTrois();
    await expect(
      backend.settlements.record({
        spaceId: space.id,
        fromParticipantId: anne,
        toParticipantId: anne,
        amount: 100,
        settledOn: '2026-09-07',
      })
    ).rejects.toMatchObject({ detail: 'same-person' });
  });
});

describe('journal', () => {
  it('trace les gestes, les plus récents d’abord', async () => {
    const { space } = await espaceAvecTrois();
    const entries = await backend.activity.list(space.id);
    expect(entries.map(e => `${e.entity}:${e.action}`)).toEqual([
      'participants:insert',
      'participants:insert',
      'participants:insert',
      'expense_spaces:insert',
    ]);
  });
});
