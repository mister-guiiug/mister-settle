import { describe, expect, it } from 'vitest';
import brut from './index.css?raw';

/**
 * LE CONTOUR D'UN CONTRÔLE, MESURÉ DEPUIS LA FEUILLE.
 *
 * Cette feuille n'importe pas `tokens.css` : un rôle qu'elle ne peint pas
 * n'existe pas, et les composants du socle prennent leur repli. Pour
 * `--dwc-border-strong`, ce repli était `--dwc-border`, et le pourtour d'un
 * champ tombait à 1,3:1, sous les 3:1 de WCAG 1.4.11. Relevé le 02/10/2026 ;
 * le défaut venait du squelette (pwa-starter-kit#88), et axe ne mesure pas
 * le contraste d'un contour : aucune suite ne l'avait vu.
 *
 * Ce test relit `index.css` et refait l'arithmétique WCAG dans les deux
 * thèmes, sur les trois fonds où se pose un contrôle : 22 champs de saisie,
 * 11 listes déroulantes, le bouton « Annuler » de 7 confirmations. Même
 * méthode que `src/theme.test.ts` de mister-footcoach.
 */

const feuille = brut.replace(/\/\*[\s\S]*?\*\//g, '');

/** Les déclarations de tous les blocs dont le sélecteur est exactement `selecteur`. */
function jetons(selecteur: string): Map<string, string> {
  const table = new Map<string, string>();
  for (const [, sel, corps] of feuille.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    // Ce qui suit le dernier `;` : le premier bloc emporte sinon les `@import`.
    if (sel!.split(';').pop()!.trim() !== selecteur) continue;
    for (const [, nom, valeur] of corps!.matchAll(
      /(--[a-z0-9-]+)\s*:\s*([^;]+);/g
    )) {
      table.set(nom!, valeur!.trim());
    }
  }
  return table;
}

const CLAIR = jetons(':root');
const SOMBRE = new Map([...CLAIR, ...jetons("[data-theme='dark']")]);

function luminance(couleur: string): number {
  const h = couleur.replace('#', '');
  const canal = (i: number) => {
    const c = Number.parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(0) + 0.7152 * canal(2) + 0.0722 * canal(4);
}

function contraste(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  const [haut, bas] = x > y ? [x, y] : [y, x];
  return (haut + 0.05) / (bas + 0.05);
}

describe('index.css - le contour des contrôles', () => {
  it.each([
    ['clair', CLAIR],
    ['sombre', SOMBRE],
  ] as const)('%s : 3:1 sur chaque fond', (_theme, table) => {
    const contour = table.get('--dwc-border-strong') ?? '';
    // Garde de non-vacuité : un jeton absent rendrait une chaîne vide, et le
    // rapport calculé sur `NaN` ne tomberait jamais.
    expect(contour).toMatch(/^#[0-9a-f]{6}$/i);
    for (const fond of ['--dwc-surface', '--dwc-surface-2', '--dwc-bg']) {
      const couleur = table.get(fond) ?? '';
      expect(couleur, fond).toMatch(/^#[0-9a-f]{6}$/i);
      expect(contraste(contour, couleur), fond).toBeGreaterThanOrEqual(3);
    }
  });
});
