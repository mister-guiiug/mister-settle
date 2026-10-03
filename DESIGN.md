# DESIGN.md — mister-settle

Direction verrouillée : **Ledger** (variante A, 28/03/2026).

> Partage de dépenses entre proches et groupes : qui a payé, qui doit combien,
> remboursements déclarés — sans aucun paiement dans l’application.
> Posture : outil de gestion de dépenses crédible (finance ops légère), pas
> PWA « loft entre potes ».

## Memorable thing

« On ouvre l’espace et on sait tout de suite ce qu’on doit, ce qui est en
brouillon, et le prochain geste pour s’arranger — sans jamais confondre ça
avec un virement. »

## Visual thesis

Chrome d’application navy, accent teal, montants en mono tabular. Listes
denses, peu d’ornement, contraste sémantique strict (dû / créancier). La
confiance (« aucun paiement, aucune banque ») est courte et permanente aux
endroits où l’utilisateur pourrait se tromper (remboursements, accueil hors
session).

## Typography

| Rôle                 | Police                               | Notes                                |
| -------------------- | ------------------------------------ | ------------------------------------ |
| UI                   | **IBM Plex Sans**                    | 400 / 500 / 600 / 700                |
| Montants, soldes     | **IBM Plex Mono**                    | `font-variant-numeric: tabular-nums` |
| Interdit en primaire | Inter, Roboto, Arial, system-ui seul |                                      |

Chargement : Google Fonts (`fonts.googleapis.com` / `fonts.gstatic.com`),
autorisé dans la CSP (`vite.config.ts`).

## Color

Peintes sur les jetons du socle (`--dwc-*`) dans `src/index.css` — jamais en
doublon à côté.

### Clair

| Token                 | Valeur    | Usage                                  |
| --------------------- | --------- | -------------------------------------- |
| `--dwc-bg`            | `#f4f6f8` | Fond page                              |
| `--dwc-surface`       | `#ffffff` | Cartes, sheets                         |
| `--dwc-surface-2`     | `#eef2f5` | Surfaces secondaires, fonds de champ   |
| `--dwc-text`          | `#0b1f33` | Encre (navy)                           |
| `--dwc-text-soft`     | `#5a6b7d` | Secondaire                             |
| `--dwc-border`        | `#d5dde6` | Filets                                 |
| `--dwc-border-strong` | `#5a6b7d` | Contours contrôles (≥ 3:1 WCAG 1.4.11) |
| `--dwc-primary`       | `#0d9488` | CTA, nav active, FAB                   |
| `--dwc-primary-soft`  | `#d9f3ef` | Fonds accent doux                      |
| `--dwc-danger`        | `#b42318` | Solde négatif, zone sensible           |
| `--dwc-success`       | `#0f766e` | Solde positif                          |
| `--dwc-warning`       | `#b54708` | Attention / pending                    |
| Chrome header (app)   | `#0b1f33` | En-tête sombre, texte clair            |

### Sombre

| Token                 | Valeur    |
| --------------------- | --------- |
| `--dwc-bg`            | `#0b1f33` |
| `--dwc-surface`       | `#12263a` |
| `--dwc-surface-2`     | `#1a3348` |
| `--dwc-text`          | `#e8eef4` |
| `--dwc-text-soft`     | `#9aadc0` |
| `--dwc-border`        | `#2a455c` |
| `--dwc-border-strong` | `#8a9aab` |
| `--dwc-primary`       | `#2dd4bf` |
| `--dwc-primary-soft`  | `#134e4a` |
| `--dwc-danger`        | `#f2b8b5` |
| `--dwc-success`       | `#5eead4` |
| `--dwc-warning`       | `#f0c674` |

Pas de dégradés violets, pas de glow marketing, pas de fond crème / terracotta
broadsheet.

## Layout

- Mobile-first PWA : `BottomNav` fixe, FAB du geste principal au-dessus.
- Largeur contenu : `PageContainer` `width="md"` (socle) — pas de console
  multi-colonnes pour l’instant.
- Listes de dépenses / soldes : densité tableur (padding serré, montant aligné
  à droite en mono).
- Radius cartes : `0.75rem` (un cran sous l’ancien 0.875rem).

## Navigation

Inchangée fonctionnellement (socle `BottomNav`) :

- Hors espace : Espaces · Réglages · Compte · À propos
- Dans un espace : Espace · Dépenses · Soldes · Remboursements · Plus
  (activité, stats, réglages espace)

L’en-tête est peint en navy Ledger ; les actions d’en-tête héritent de sa
couleur (pas `--dwc-text` du thème page).

## Patterns UX (écrans)

Implémentés (branche `design/ledger-screens`) :

1. **Dashboard** — solde perso en héros ; CTA vers remboursements si `|net| > 0` ; bloc « à traiter » (brouillons).
2. **Dépenses** — groupement par jour, montants mono, chips de filtre.
3. **Soldes** — barres proportionnelles, tri `|net|`, CTA « régler ».
4. **Remboursements** — suggestion = CTA Déclarer ; disclaimer banque court.
5. **Accueil** — carte espace avec solde perso + dernière activité ; attention brouillons.
6. **Assistant** — stepper + montant toujours visible (impact soldes inchangé au pas 3).

Règles métier inchangées (pas de paiement, validation explicite, suggestions
informatives, personnes sans compte).

## Motion

- Transitions courtes (≤ 180 ms)
- Respect `prefers-reduced-motion`
- Pas d’animations décoratives

## Anti-patterns (refusés)

- Confondre « déclarer un remboursement » avec un transfert d’argent
- Cartes empilées sans hiérarchie de montant
- Primary bleu générique du socle (`#3b6ea5`) comme identité
- Happy talk long devant le geste de création de dépense
- Bottom-nav redondante avec un second lien « Espaces » dans l’en-tête hors espace

## Source maquette

`~/.gstack/projects/mister-settle/designs/app-redesign-20260328/` —
`design-board.html`, `approved.json` variante **A · Ledger**.
