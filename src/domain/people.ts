import type { Group, Participant } from '../backend/ports.ts';

/**
 * LES PERSONNES ET LES REGROUPEMENTS, CÔTÉ DOMAINE : ce qui se calcule sans
 * base ni écran — des initiales, une couleur stable, l'ordre d'affichage, et
 * le DÉPLIAGE d'un regroupement en personnes réellement retenues (ADR 0012).
 */

/**
 * La palette des avatars : des teintes assez sombres pour porter des
 * initiales blanches, en clair comme en sombre. Ce n'est pas un choix offert
 * à l'utilisateur — `ColorPicker` a le sien ; celle-ci sert quand personne
 * n'a choisi.
 */
export const AVATAR_PALETTE = [
  '#c1572d',
  '#3d405b',
  '#3a7d5b',
  '#8a5a2b',
  '#6d597a',
  '#b04a6a',
  '#355070',
  '#1f7a70',
  '#7a5c58',
  '#3f5fd1',
] as const;

/**
 * « Alice Martin » → « AM », « alice » → « AL », « Jean Pierre Dupont » →
 * « JPD » : la première lettre de chaque mot, trois au plus — ce que la base
 * accepte pour `initials`. Un nom vide n'a pas d'initiales.
 */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words[0];
  if (first === undefined) return '';
  const letters =
    words.length === 1
      ? [...first].slice(0, 2)
      : words.slice(0, 3).map(word => [...word][0] ?? '');
  return letters.join('').toLocaleUpperCase();
}

/**
 * UNE COULEUR STABLE POUR UN NOM : le même nom donne la même couleur, sur
 * tous les appareils, sans rien stocker — jusqu'à ce que quelqu'un en
 * choisisse une (`avatarColor`), qui prime alors.
 */
export function pickColor(seed: string): string {
  let hash = 5381;
  for (const char of seed) {
    hash = (Math.imul(hash, 33) ^ (char.codePointAt(0) ?? 0)) >>> 0;
  }
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length] ?? AVATAR_PALETTE[0];
}

/** Ce qu'il faut pour ordonner et réécrire une ligne : sa place, sa version. */
export interface Ordered {
  id: string;
  position: number;
  version: number;
}

/** L'ordre d'affichage : la position, puis l'identifiant — total et stable. */
export function byPosition<T extends Ordered>(a: T, b: T): number {
  if (a.position !== b.position) return a.position - b.position;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * MONTER OU DESCENDRE UNE LIGNE, et ne réécrire que ce qui change. Le
 * résultat est la liste des écritures à faire — deux, quand les positions
 * étaient déjà nettes ; davantage si d'anciennes données se chevauchaient,
 * et la liste ressort alors numérotée de zéro à n − 1. Vide au bord, et
 * pour une inconnue.
 */
export function reorder<T extends Ordered>(
  items: T[],
  id: string,
  direction: 'up' | 'down'
): { item: T; position: number }[] {
  const ordered = [...items].sort(byPosition);
  const index = ordered.findIndex(item => item.id === id);
  const target = direction === 'up' ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= ordered.length) return [];
  const [moved] = ordered.splice(index, 1);
  if (moved === undefined) return [];
  ordered.splice(target, 0, moved);
  return ordered
    .map((item, position) => ({ item, position }))
    .filter(({ item, position }) => item.position !== position);
}

/**
 * LE DÉPLIAGE : les personnes qu'un regroupement retient VRAIMENT — les
 * membres connus, non archivés, sans doublon, dans l'ordre d'affichage. C'est
 * cette liste, et jamais le regroupement, qui reçoit des montants.
 */
export function expandGroup(
  group: Pick<Group, 'memberIds'>,
  participants: Participant[]
): Participant[] {
  const wanted = new Set(group.memberIds);
  return participants
    .filter(p => wanted.has(p.id) && !p.archivedAt)
    .sort(byPosition);
}
