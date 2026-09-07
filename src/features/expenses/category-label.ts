import type { Category } from '../../backend/ports.ts';

/** Les clés du catalogue commun (0006), traduites dans `messages.categories`. */
const COMMON_KEYS = [
  'logement',
  'transport',
  'courses',
  'restaurant',
  'loisirs',
  'sante',
  'cadeaux',
  'autre',
] as const;
type CommonKey = (typeof COMMON_KEYS)[number];
const isCommonKey = (key: string): key is CommonKey =>
  (COMMON_KEYS as readonly string[]).includes(key);

/**
 * Le nom d'une catégorie : traduit pour le catalogue commun, tel quel pour
 * celles de l'espace — elles sont écrites par ses membres, dans leur langue.
 */
export function categoryName(
  category: Category,
  t: (key: `categories.${CommonKey}`) => string
): string {
  return category.key && isCommonKey(category.key)
    ? t(`categories.${category.key}`)
    : category.name;
}
