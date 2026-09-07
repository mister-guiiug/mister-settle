/**
 * LA SÉLECTION UNIFIÉE : des personnes, des regroupements, et à la fin **une
 * liste de personnes, chacune une fois**.
 *
 * Le formulaire de dépense propose les deux côte à côte. Ce module résout ce
 * que l'utilisateur a réellement retenu : les personnes cochées, plus les
 * membres des regroupements cochés, moins celles qu'il a retirées à la main —
 * même si elles venaient d'un regroupement. Une personne présente dans deux
 * regroupements cochés n'apparaît qu'une fois, et sait de quels regroupements
 * elle vient (pour l'affichage « via Famille Martin »).
 *
 * Le résultat est rendu dans l'ORDRE DES PERSONNES DE L'ESPACE, pas dans
 * l'ordre des clics : c'est l'ordre stable dont `split.ts` a besoin.
 */

export interface GroupForSelection {
  id: string;
  memberIds: readonly string[];
}

export interface SelectionInput {
  /** Toutes les personnes sélectionnables, dans l'ordre de l'espace. */
  orderedParticipantIds: readonly string[];
  /** Personnes cochées directement. */
  directIds: readonly string[];
  /** Regroupements cochés. */
  selectedGroupIds: readonly string[];
  groups: readonly GroupForSelection[];
  /** Personnes retirées à la main, d'où qu'elles viennent. */
  excludedIds: readonly string[];
}

export interface ResolvedMember {
  participantId: string;
  /** Cochée elle-même. */
  direct: boolean;
  /** Les regroupements cochés qui la contiennent. */
  viaGroupIds: string[];
}

export function resolveSelection(input: SelectionInput): ResolvedMember[] {
  const excluded = new Set(input.excludedIds);
  const direct = new Set(input.directIds);
  const viaByParticipant = new Map<string, string[]>();
  const groupsById = new Map(input.groups.map(g => [g.id, g] as const));

  for (const groupId of input.selectedGroupIds) {
    const group = groupsById.get(groupId);
    if (!group) continue;
    for (const memberId of group.memberIds) {
      const via = viaByParticipant.get(memberId) ?? [];
      if (!via.includes(groupId)) via.push(groupId);
      viaByParticipant.set(memberId, via);
    }
  }

  const result: ResolvedMember[] = [];
  for (const participantId of input.orderedParticipantIds) {
    if (excluded.has(participantId)) continue;
    const isDirect = direct.has(participantId);
    const viaGroupIds = viaByParticipant.get(participantId) ?? [];
    if (!isDirect && viaGroupIds.length === 0) continue;
    result.push({ participantId, direct: isDirect, viaGroupIds });
  }
  return result;
}

/**
 * Ce que « retirer une personne » veut dire selon d'où elle vient : cochée
 * directement, on la décoche ; venue d'un regroupement, on l'exclut — et
 * l'exclusion survit à un nouveau clic sur le regroupement, jusqu'à ce qu'on
 * la recoche elle-même.
 */
export function removeFromSelection(
  input: SelectionInput,
  participantId: string
): SelectionInput {
  return {
    ...input,
    directIds: input.directIds.filter(id => id !== participantId),
    excludedIds: input.excludedIds.includes(participantId)
      ? input.excludedIds
      : [...input.excludedIds, participantId],
  };
}

/** Recocher une personne lève son exclusion. */
export function addToSelection(
  input: SelectionInput,
  participantId: string
): SelectionInput {
  return {
    ...input,
    directIds: input.directIds.includes(participantId)
      ? input.directIds
      : [...input.directIds, participantId],
    excludedIds: input.excludedIds.filter(id => id !== participantId),
  };
}

export function toggleGroup(
  input: SelectionInput,
  groupId: string
): SelectionInput {
  const selected = input.selectedGroupIds.includes(groupId);
  return {
    ...input,
    selectedGroupIds: selected
      ? input.selectedGroupIds.filter(id => id !== groupId)
      : [...input.selectedGroupIds, groupId],
  };
}
