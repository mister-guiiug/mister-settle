import { describe, expect, it } from 'vitest';
import type { Participant } from '../backend/ports.ts';
import {
  AVATAR_PALETTE,
  byPosition,
  expandGroup,
  initialsOf,
  pickColor,
  reorder,
} from './people.ts';

const person = (
  id: string,
  position: number,
  extra: Partial<Participant> = {}
): Participant => ({
  id,
  spaceId: 's',
  displayName: id,
  initials: '',
  avatarColor: '',
  email: null,
  position,
  archivedAt: null,
  version: 1,
  linkedUserId: null,
  ...extra,
});

describe('initialsOf', () => {
  it('prend la première lettre de chaque mot, trois au plus', () => {
    expect(initialsOf('Alice Martin')).toBe('AM');
    expect(initialsOf('Jean Pierre Dupont Xavier')).toBe('JPD');
  });

  it('prend deux lettres d’un nom seul, et respecte les accents', () => {
    expect(initialsOf('alice')).toBe('AL');
    expect(initialsOf('  éloïse ')).toBe('ÉL');
  });

  it('ne donne rien pour rien', () => {
    expect(initialsOf('   ')).toBe('');
  });
});

describe('pickColor', () => {
  it('est stable, et pioche dans la palette', () => {
    expect(pickColor('Alice')).toBe(pickColor('Alice'));
    expect(AVATAR_PALETTE).toContain(pickColor('Alice'));
    expect(AVATAR_PALETTE).toContain(pickColor(''));
  });
});

describe('reorder', () => {
  const list = [person('a', 0), person('b', 1), person('c', 2)];

  it('échange avec la voisine : deux écritures', () => {
    expect(reorder(list, 'b', 'up')).toEqual([
      { item: list[1], position: 0 },
      { item: list[0], position: 1 },
    ]);
    expect(reorder(list, 'b', 'down')).toEqual([
      { item: list[2], position: 1 },
      { item: list[1], position: 2 },
    ]);
  });

  it('ne fait rien au bord, ni pour une inconnue', () => {
    expect(reorder(list, 'a', 'up')).toEqual([]);
    expect(reorder(list, 'c', 'down')).toEqual([]);
    expect(reorder(list, 'zz', 'up')).toEqual([]);
  });

  it('renumérote des positions qui se chevauchaient', () => {
    const flat = [person('a', 0), person('b', 0), person('c', 0)];
    // Ordre stable par identifiant : a, b, c. Monter c donne a, c, b.
    expect(reorder(flat, 'c', 'up')).toEqual([
      { item: flat[2], position: 1 },
      { item: flat[1], position: 2 },
    ]);
  });

  it('ordonne par position, puis par identifiant', () => {
    const ids = [person('b', 1), person('a', 1), person('c', 0)]
      .sort(byPosition)
      .map(p => p.id);
    expect(ids).toEqual(['c', 'a', 'b']);
  });
});

describe('expandGroup', () => {
  it('retient les membres connus et actifs, sans doublon, dans l’ordre', () => {
    const people = [
      person('a', 2),
      person('b', 0),
      person('c', 1, { archivedAt: '2026-09-01T00:00:00.000Z' }),
    ];
    const members = expandGroup(
      { memberIds: ['a', 'a', 'c', 'inconnu', 'b'] },
      people
    );
    expect(members.map(p => p.id)).toEqual(['b', 'a']);
  });
});
