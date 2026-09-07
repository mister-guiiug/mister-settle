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
  l'appareil, une création attend le réseau puis part une seule fois.

## Ce qu'elle ne fait jamais

Aucune carte de paiement, aucun transfert d'argent, aucune connexion bancaire,
aucune demande de paiement, aucun stockage de coordonnées bancaires, aucun
encaissement. L'application **calcule** des dépenses, des soldes et des
suggestions ; l'argent circule ailleurs, entre les personnes.

## Deux façons de l'utiliser

**Sur l'appareil seul** : sans compte, tout vit dans le navigateur — un
espace, ses personnes, ses dépenses. L'export et l'import de fichier (Réglages)
font passer le tout d'un appareil à l'autre.

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
`SUPABASE_PROJECT_ID` ; en **secrets** : `SUPABASE_ACCESS_TOKEN`,
`SUPABASE_DB_PASSWORD`. Le déploiement passe les deux `VITE_*` au build ; sans
elles, le site tourne quand même, sur l'appareil.

## Les décisions

Héritées du squelette et propres à l'application : [`docs/adr/`](./docs/adr/README.md).
L'analyse initiale, ses hypothèses et son plan en lots :
[`docs/00-analyse-initiale.md`](./docs/00-analyse-initiale.md).

## Licence

MIT — voir [LICENSE](./LICENSE).
