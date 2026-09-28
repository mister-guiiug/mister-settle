# mister-settle

Partage de dépenses entre proches : qui a payé, qui doit combien, remboursements suggérés — sans aucun paiement dans l’application.

Application PWA de la famille `miss-*` / `mister-*`, née du squelette
[`pwa-starter-kit`](https://github.com/mister-guiiug/pwa-starter-kit) et bâtie
sur [`@mister-guiiug/dev-pwa-config`](https://github.com/mister-guiiug/dev-pwa-config).
Elle est servie sur <https://mister-guiiug.github.io/mister-settle/>.

## Ce qu'elle fait

- **Des espaces** — un voyage, une colocation, une famille — avec des
  **personnes** (qui existent sans compte) et des **regroupements** (« les
  enfants », « la famille ») qui ne servent qu'à sélectionner : un montant va
  toujours à des personnes.
- **Des dépenses** en trois pas : quoi et combien ; qui a payé (un ou
  plusieurs), pour qui ; synthèse. Trois modèles de répartition — équitable,
  par montants, par parts — et un centime jamais perdu. Une répartition ne
  compte que **validée**, par un geste explicite ; la modifier la remet en
  brouillon.
- **Des soldes** recalculés à chaque instant, par personne ou consolidés par
  regroupement, et des **remboursements suggérés** — au plus une opération
  de moins que de personnes. Un remboursement se **déclare** : c'est une note
  partagée, datée, annulable.
- **Des justificatifs** photographiés, réencodés sans métadonnées, rangés dans
  un espace privé ; un **journal** de ce qui s'est passé ; des
  **statistiques** par catégorie, mois et personne ; des **exports** CSV
  (Excel français) et XLSX.
- **Des invitations** par lien, avec un rôle — lecture, contribution,
  administration — révocables.
- **Hors ligne** : ce qui a été ouvert se relit, un brouillon reste sur
  l'appareil, une nouvelle dépense attend le réseau puis part une seule fois ;
  valider une répartition, déclarer un remboursement ou inviter demande le
  réseau.

## Ce qu'elle ne fait jamais

Aucune carte de paiement, aucun transfert d'argent, aucune connexion bancaire,
aucune demande de paiement, aucun stockage de coordonnées bancaires, aucun
encaissement. L'application **calcule** des dépenses, des soldes et des
suggestions ; l'argent circule ailleurs, entre les personnes.

## Deux façons de l'utiliser

**Sur l'appareil seul** : sans compte, tout vit dans le navigateur — un
espace, ses personnes, ses dépenses. L'export et l'import de fichier (Réglages)
font passer les espaces, leurs personnes et leurs dépenses d'un appareil à
l'autre ; les photos des justificatifs restent sur l'appareil d'origine.

**Avec une base partagée** (le site publié) : un compte, des espaces qui
suivent d'un appareil à l'autre, des membres invités par lien. La base décide
des droits ; l'interface ne fait que les montrer.

## Démarrer

```bash
npm install
```

```bash
npm run dev
```

L'installation lit le socle sur GitHub Packages : exporter `NODE_AUTH_TOKEN`
(un jeton avec `read:packages`) avant `npm install`.

**L'application démarre sans configuration**, sur son stockage local. C'est une
propriété à conserver : elle rend possibles le hors-ligne, les tests sans
secrets, et la page publique qu'on ouvre sans compte.

## Vérifier

```bash
npm run build
```

Le build enchaîne `tsc -b`, Vite, le budget de poids et `pwa-doctor --strict` :
il échoue à la moindre dette de conformité au parc. `npm test` joue les tests
unitaires, `npm run test:e2e` les parcours Playwright ; la CI joue en plus les
tests pgTAP de la base sur une pile jetable.

## La base partagée

Le schéma, ses politiques et ses fonctions vivent dans `supabase/` et
s'appliquent au projet par le workflow `supabase-migrations.yml`. Le dépôt
attend, en **variables** : `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
`SUPABASE_PROJECT_ID`, `VITE_SENTRY_DSN`, `VITE_POSTHOG_KEY` ; en **secret** :
`SUPABASE_DB_PASSWORD` (les migrations passent par le pooler ; aucun workflow
ne lit plus `SUPABASE_ACCESS_TOKEN`). Le déploiement passe les quatre `VITE_*`
au build ; sans celles de Supabase, le site tourne quand même, sur l'appareil.

Sur le site publié, Sentry (région européenne) démarre à l'ouverture, sans
consentement, et ne reçoit un rapport que lorsqu'une erreur survient. PostHog
(nuage européen) ne mesure l'audience qu'après accord dans le bandeau.

## Les décisions

Héritées du squelette et propres à l'application : [`docs/adr/`](./docs/adr/README.md).
L'analyse initiale, ses hypothèses et son plan en lots :
[`docs/00-analyse-initiale.md`](./docs/00-analyse-initiale.md).

## Licence

MIT — voir [LICENSE](./LICENSE).
