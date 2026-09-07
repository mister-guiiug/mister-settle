/**
 * LES DATES DE DÉPENSE SONT DES JOURS, PAS DES INSTANTS : `AAAA-MM-JJ`, sans
 * fuseau. `new Date('2026-09-07')` lirait minuit UTC et afficherait la
 * veille à l'ouest de Greenwich ; on ancre donc explicitement à minuit local.
 */
export function localDate(iso: string): Date {
  return new Date(`${iso}T00:00:00`);
}

/** Aujourd'hui, dans le fuseau de l'appareil, au format `AAAA-MM-JJ`. */
export function todayIso(now: Date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
