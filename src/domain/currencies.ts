/**
 * Les devises proposées à la création d'un espace. Une liste courte et
 * délibérée : l'euro d'abord, puis les monnaies des voisins et des voyages
 * courants. Toute devise ISO 4217 reste acceptée par le modèle ; ceci n'est
 * que ce que le menu montre.
 */
export const CURRENCIES: readonly string[] = [
  'EUR',
  'CHF',
  'GBP',
  'USD',
  'CAD',
  'MAD',
  'TND',
  'XOF',
  'JPY',
  'AUD',
  'NOK',
  'SEK',
  'DKK',
  'PLN',
  'CZK',
];

/** « EUR — euro », dans la langue courante quand le navigateur la connaît. */
export function currencyLabel(code: string, locale: string): string {
  try {
    const name = new Intl.DisplayNames([locale], { type: 'currency' }).of(code);
    return name && name !== code ? `${code} — ${name}` : code;
  } catch {
    return code;
  }
}
