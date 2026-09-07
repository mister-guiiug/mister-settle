import { describe, expect, it } from 'vitest';
import { amountOf, describeActivity } from './activity.ts';

describe('describeActivity', () => {
  it('traduit table + action en clé, avec le libellé et le montant', () => {
    expect(
      describeActivity(
        {
          entity: 'expenses',
          action: 'validate',
          payload: { label: 'Restaurant', amount: '30.00' },
        },
        2
      )
    ).toMatchObject({
      key: 'expenseValidated',
      label: 'Restaurant',
      amount: 3000,
    });
    expect(
      describeActivity(
        {
          entity: 'expenses',
          action: 'insert',
          payload: { label: 'Courses', amount: 1250, status: 'draft' },
        },
        2
      )
    ).toMatchObject({ key: 'expenseCreated', amount: 1250 });
  });

  it('distingue un remboursement annulé d’un remboursement modifié', () => {
    expect(
      describeActivity(
        {
          entity: 'settlements',
          action: 'update',
          payload: { status: 'cancelled', amount: 1500 },
        },
        2
      ).key
    ).toBe('settlementCancelled');
    expect(
      describeActivity(
        { entity: 'settlements', action: 'update', payload: { amount: 1500 } },
        2
      ).key
    ).toBe('settlementUpdated');
  });

  it('garde le rôle d’une invitation, et retombe sur le générique', () => {
    expect(
      describeActivity(
        {
          entity: 'invitations',
          action: 'accept',
          payload: { role: 'reader' },
        },
        2
      )
    ).toMatchObject({ key: 'invitationAccepted', role: 'reader' });
    expect(
      describeActivity(
        { entity: 'categories', action: 'insert', payload: {} },
        2
      )
    ).toMatchObject({ key: 'generic', entity: 'categories', action: 'insert' });
  });
});

describe('amountOf', () => {
  it('lit un entier tel quel, un décimal en texte selon la devise, rien sinon', () => {
    expect(amountOf({ amount: 3000 }, 2)).toBe(3000);
    expect(amountOf({ amount: '30.00' }, 2)).toBe(3000);
    expect(amountOf({ amount: '1200' }, 0)).toBe(1200);
    expect(amountOf({ amount: 'n/a' }, 2)).toBeNull();
    expect(amountOf({}, 2)).toBeNull();
  });
});
