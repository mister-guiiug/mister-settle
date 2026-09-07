import type { ActivityEntry } from '../backend/ports.ts';
import { fromDecimalString, type Minor } from './money.ts';

/**
 * LE JOURNAL, CÔTÉ DOMAINE : une entrée brute (table, action, charge utile)
 * devient une PHRASE à traduire et ses paramètres. La base et l'adaptateur
 * local consignent la même chose — à une différence près : le montant, en
 * texte décimal côté SQL, en entier d'unités mineures sur l'appareil.
 */

export type ActivityKey =
  | 'spaceCreated'
  | 'spaceUpdated'
  | 'participantAdded'
  | 'participantUpdated'
  | 'participantArchived'
  | 'participantUnarchived'
  | 'participantLinked'
  | 'participantUnlinked'
  | 'participantRemoved'
  | 'groupCreated'
  | 'groupUpdated'
  | 'groupRemoved'
  | 'expenseCreated'
  | 'expenseUpdated'
  | 'expenseValidated'
  | 'expenseArchived'
  | 'expenseUnarchived'
  | 'expenseRemoved'
  | 'settlementRecorded'
  | 'settlementCancelled'
  | 'settlementUpdated'
  | 'invitationCreated'
  | 'invitationAccepted'
  | 'invitationRevoked'
  | 'membershipJoined'
  | 'membershipLeft'
  | 'membershipTransferred'
  | 'generic';

export interface ActivityDescription {
  key: ActivityKey;
  label: string;
  amount: Minor | null;
  role: string;
  entity: string;
  action: string;
}

const TABLE: Record<string, Record<string, ActivityKey>> = {
  expense_spaces: { insert: 'spaceCreated', update: 'spaceUpdated' },
  participants: {
    insert: 'participantAdded',
    update: 'participantUpdated',
    archive: 'participantArchived',
    unarchive: 'participantUnarchived',
    link: 'participantLinked',
    unlink: 'participantUnlinked',
    delete: 'participantRemoved',
  },
  participant_groups: {
    insert: 'groupCreated',
    update: 'groupUpdated',
    delete: 'groupRemoved',
  },
  expenses: {
    insert: 'expenseCreated',
    update: 'expenseUpdated',
    validate: 'expenseValidated',
    archive: 'expenseArchived',
    unarchive: 'expenseUnarchived',
    delete: 'expenseRemoved',
  },
  settlements: { insert: 'settlementRecorded', update: 'settlementUpdated' },
  invitations: {
    insert: 'invitationCreated',
    accept: 'invitationAccepted',
    update: 'invitationRevoked',
    delete: 'invitationRevoked',
  },
  space_memberships: {
    insert: 'membershipJoined',
    delete: 'membershipLeft',
    transfer: 'membershipTransferred',
  },
};

/** Le montant d'une charge utile : entier sur l'appareil, décimal en texte côté base. */
export function amountOf(
  payload: Record<string, unknown>,
  minorUnit: number
): Minor | null {
  const value = payload.amount;
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value === 'string') return fromDecimalString(value, minorUnit);
  return null;
}

export function describeActivity(
  entry: Pick<ActivityEntry, 'entity' | 'action' | 'payload'>,
  minorUnit: number
): ActivityDescription {
  const payload = entry.payload;
  let key: ActivityKey = TABLE[entry.entity]?.[entry.action] ?? 'generic';
  if (key === 'settlementUpdated' && payload.status === 'cancelled') {
    key = 'settlementCancelled';
  }
  return {
    key,
    label: typeof payload.label === 'string' ? payload.label : '',
    amount: amountOf(payload, minorUnit),
    role: typeof payload.role === 'string' ? payload.role : '',
    entity: entry.entity,
    action: entry.action,
  };
}
