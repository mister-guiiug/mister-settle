import { describe, expect, it } from 'vitest';
import {
  addToSelection,
  removeFromSelection,
  resolveSelection,
  toggleGroup,
  type SelectionInput,
} from './selection.ts';

/**
 * Ce que ces tests figent : une personne présente dans plusieurs regroupements
 * cochés compte UNE fois ; retirer une personne venue d'un regroupement
 * survit à un nouveau clic sur le regroupement ; le résultat suit l'ordre des
 * personnes de l'espace.
 */
const base: SelectionInput = {
  orderedParticipantIds: ['alice', 'bob', 'charlie', 'dana'],
  directIds: [],
  selectedGroupIds: [],
  groups: [
    { id: 'martin', memberIds: ['alice', 'bob', 'charlie'] },
    { id: 'parents', memberIds: ['alice', 'bob'] },
  ],
  excludedIds: [],
};

describe('resolveSelection', () => {
  it('ne compte une personne qu’une fois, en disant d’où elle vient', () => {
    const result = resolveSelection({
      ...base,
      selectedGroupIds: ['martin', 'parents'],
    });
    expect(result.map(r => r.participantId)).toEqual([
      'alice',
      'bob',
      'charlie',
    ]);
    expect(result[0]?.viaGroupIds).toEqual(['martin', 'parents']);
    expect(result[2]?.viaGroupIds).toEqual(['martin']);
    expect(result.every(r => !r.direct)).toBe(true);
  });

  it('rend l’ordre de l’espace, pas celui des clics', () => {
    const result = resolveSelection({
      ...base,
      directIds: ['dana', 'alice'],
    });
    expect(result.map(r => r.participantId)).toEqual(['alice', 'dana']);
    expect(result.every(r => r.direct)).toBe(true);
  });

  it('ignore un regroupement inconnu', () => {
    expect(
      resolveSelection({ ...base, selectedGroupIds: ['fantome'] })
    ).toEqual([]);
  });
});

describe('retirer et recocher', () => {
  it('retire une personne venue d’un regroupement, et l’exclusion tient', () => {
    let input: SelectionInput = { ...base, selectedGroupIds: ['martin'] };
    input = removeFromSelection(input, 'bob');
    expect(resolveSelection(input).map(r => r.participantId)).toEqual([
      'alice',
      'charlie',
    ]);

    // Décocher puis recocher le regroupement ne ramène pas Bob.
    input = toggleGroup(toggleGroup(input, 'martin'), 'martin');
    expect(resolveSelection(input).map(r => r.participantId)).toEqual([
      'alice',
      'charlie',
    ]);
  });

  it('recocher la personne elle-même lève l’exclusion', () => {
    let input: SelectionInput = { ...base, selectedGroupIds: ['martin'] };
    input = removeFromSelection(input, 'bob');
    input = addToSelection(input, 'bob');
    const result = resolveSelection(input);
    expect(result.map(r => r.participantId)).toEqual([
      'alice',
      'bob',
      'charlie',
    ]);
    expect(result[1]).toEqual({
      participantId: 'bob',
      direct: true,
      viaGroupIds: ['martin'],
    });
  });

  it('retirer une personne cochée directement la décoche', () => {
    const input = removeFromSelection({ ...base, directIds: ['dana'] }, 'dana');
    expect(resolveSelection(input)).toEqual([]);
  });
});
