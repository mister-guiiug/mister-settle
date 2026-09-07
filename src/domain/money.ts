/**
 * LA MONNAIE EST UN ENTIER. Toujours.
 *
 * Le socle formate un `number` (`format.js`) mais ne calcule rien : c'est à
 * l'application de garantir qu'aucun montant ne traverse un flottant. Un
 * montant est donc un **entier d'unités mineures** (des centimes pour l'euro),
 * un `number` sûr (`Number.isSafeInteger`, soit jusqu'à 90 000 milliards
 * d'euros — la borne n'est pas le problème). Les seuls produits qui pourraient
 * déborder, ceux des parts, passent par `BigInt` dans `split.ts`.
 *
 * Le flottant n'apparaît qu'au bord, pour `Intl.NumberFormat` : `toDisplayNumber`
 * est la seule fonction de ce module qui en rende un, et elle le dit.
 */

/**
 * Décimales des devises qui n'en ont pas deux (ISO 4217). Tout ce qui n'est
 * pas ici en a deux — c'est le cas de l'euro, du dollar, de la livre, du
 * franc suisse. La liste est un plancher sûr, pas une base de données.
 */
export const MINOR_UNITS: Readonly<Record<string, number>> = {
  JPY: 0,
  KRW: 0,
  VND: 0,
  CLP: 0,
  ISK: 0,
  XOF: 0,
  XAF: 0,
  KWD: 3,
  BHD: 3,
  OMR: 3,
  JOD: 3,
  TND: 3,
  IQD: 3,
  LYD: 3,
};

export const DEFAULT_MINOR_UNIT = 2;

/** Nombre de décimales d'une devise (`'EUR'` → 2, `'JPY'` → 0). */
export function minorUnitOf(currency: string): number {
  return MINOR_UNITS[currency.toUpperCase()] ?? DEFAULT_MINOR_UNIT;
}

/** `true` pour un code ISO 4217 de forme valide (trois lettres majuscules). */
export function isCurrencyCode(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Z]{3}$/.test(value);
}

/** Un montant en unités mineures : un entier, jamais un flottant. */
export type Minor = number;

/** Un entier sûr — c'est la seule forme qu'un montant a le droit d'avoir. */
export function isMinor(value: unknown): value is Minor {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

/** Lève si `value` n'est pas un montant : le bug se voit là où il naît. */
export function assertMinor(value: number, label = 'montant'): Minor {
  if (!isMinor(value)) {
    throw new TypeError(`${label} : entier attendu, reçu ${String(value)}`);
  }
  return value;
}

/** Somme d'entiers, vérifiée à chaque terme. */
export function sumMinor(values: Iterable<Minor>): Minor {
  let total = 0;
  for (const value of values) total += assertMinor(value);
  return assertMinor(total, 'somme');
}

const SPACES = /[\s']/g;

/**
 * Analyse une saisie humaine (`"1 234,50"`, `"12.5"`, `"12"`) en unités
 * mineures. `null` si la saisie n'est pas un montant — y compris quand elle
 * porte PLUS de décimales que la devise n'en a : arrondir en silence ferait
 * apparaître un centime que personne n'a tapé.
 *
 * Un seul séparateur décimal est admis, virgule ou point ; les espaces (tous
 * les espaces, insécables compris) sont ignorés. Un signe `-` est accepté et
 * rendu : c'est l'appelant qui décide si un montant négatif a un sens ici
 * (pour une dépense, non — cf. `checkExpense`).
 */
export function parseAmount(
  input: string,
  minorUnit: number = DEFAULT_MINOR_UNIT
): Minor | null {
  const cleaned = input.replace(SPACES, '');
  const match = /^([+-])?(\d{0,12})(?:[.,](\d*))?$/.exec(cleaned);
  if (!match) return null;
  const [, sign, integer = '', decimals = ''] = match;
  if (integer === '' && decimals === '') return null;
  if (decimals.length > minorUnit) return null;
  const scaled =
    Number(integer || '0') * 10 ** minorUnit +
    Number(decimals.padEnd(minorUnit, '0') || '0');
  const value = sign === '-' ? -scaled : scaled;
  return isMinor(value) ? value : null;
}

/**
 * Le montant tel qu'une colonne `numeric` l'écrit (`1250` → `"12.50"`).
 * C'est le format d'échange avec la base : jamais un flottant, une chaîne que
 * Postgres relit exactement.
 */
export function toDecimalString(
  minor: Minor,
  minorUnit: number = DEFAULT_MINOR_UNIT
): string {
  assertMinor(minor);
  const abs = Math.abs(minor);
  const sign = minor < 0 ? '-' : '';
  if (minorUnit === 0) return `${sign}${abs}`;
  const text = String(abs).padStart(minorUnit + 1, '0');
  const cut = text.length - minorUnit;
  return `${sign}${text.slice(0, cut)}.${text.slice(cut)}`;
}

/**
 * Relit ce qu'une colonne `numeric` rend (`"12.50"`, `"12.5"`, `"12"`).
 * Strict : un point comme seul séparateur, pas d'espace, pas de virgule — un
 * `numeric` Postgres ne s'écrit jamais autrement. `null` si la chaîne porte
 * plus de décimales que la devise, ce qui signalerait une base incohérente.
 */
export function fromDecimalString(
  text: string,
  minorUnit: number = DEFAULT_MINOR_UNIT
): Minor | null {
  const match = /^(-)?(\d+)(?:\.(\d+))?$/.exec(text.trim());
  if (!match) return null;
  const [, sign, integer = '0', decimals = ''] = match;
  const significant = decimals.replace(/0+$/, '');
  if (significant.length > minorUnit) return null;
  const value =
    Number(integer) * 10 ** minorUnit +
    Number(decimals.padEnd(minorUnit, '0').slice(0, minorUnit) || '0');
  const signed = sign ? -value : value;
  return isMinor(signed) ? signed : null;
}

/**
 * LE SEUL FLOTTANT DU MODULE — pour `Intl.NumberFormat`, et rien d'autre.
 * `formatCurrency` du socle veut un `number` ; à deux décimales, la division
 * est exacte pour tout entier sûr en base 10 dans les limites d'affichage.
 * Ne jamais réinjecter cette valeur dans un calcul.
 */
export function toDisplayNumber(
  minor: Minor,
  minorUnit: number = DEFAULT_MINOR_UNIT
): number {
  return assertMinor(minor) / 10 ** minorUnit;
}

/**
 * LES PARTS SONT DES ENTIERS AUSSI : quatre décimales, mises à l'échelle.
 * `1.5` part vaut `15000`. C'est ce qui rend le calcul par parts exact
 * (`split.ts`) et ce que `numeric(10,4)` stocke sans perte.
 */
export const SHARES_SCALE = 10_000;

/** Nombre maximal de parts par personne, avant mise à l'échelle. */
export const SHARES_MAX = 1_000_000;

/** `"1,5"` → `15000` ; `null` si ce n'est pas un nombre de parts positif ou nul. */
export function parseShares(input: string): number | null {
  const cleaned = input.replace(SPACES, '');
  const match = /^(\d{0,7})(?:[.,](\d{0,4}))?$/.exec(cleaned);
  if (!match) return null;
  const [, integer = '', decimals = ''] = match;
  if (integer === '' && decimals === '') return null;
  const value =
    Number(integer || '0') * SHARES_SCALE +
    Number(decimals.padEnd(4, '0') || '0');
  if (value > SHARES_MAX * SHARES_SCALE) return null;
  return value;
}

/** `15000` → `"1.5"`, `10000` → `"1"` — pour l'affichage et la base. */
export function sharesToDecimalString(scaled: number): string {
  assertMinor(scaled, 'parts');
  const integer = Math.floor(scaled / SHARES_SCALE);
  const fraction = String(scaled % SHARES_SCALE)
    .padStart(4, '0')
    .replace(/0+$/, '');
  return fraction ? `${integer}.${fraction}` : String(integer);
}

/** Relit `numeric(10,4)` (`"1.5000"`) en parts mises à l'échelle. */
export function sharesFromDecimalString(text: string): number | null {
  const match = /^(\d+)(?:\.(\d{1,4})0*)?$/.exec(text.trim());
  if (!match) return null;
  const [, integer = '0', decimals = ''] = match;
  const value =
    Number(integer) * SHARES_SCALE + Number(decimals.padEnd(4, '0') || '0');
  return value <= SHARES_MAX * SHARES_SCALE ? value : null;
}
