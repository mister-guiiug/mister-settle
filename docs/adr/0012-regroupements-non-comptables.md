# 0012 — Les regroupements ne comptent pas, et leur composition est figée

## Contexte

Une famille de trois personnes participe à un voyage. On veut la sélectionner
d'un geste, voir ce qu'elle doit en tout, filtrer ses dépenses — sans jamais
perdre ce que chacun de ses membres doit individuellement, et sans que la
recomposition de la famille l'an prochain ne réécrive le voyage de cette année.

Le piège habituel est de faire du regroupement un participant : un montant
« à la famille » qu'il faut ensuite ventiler, des soldes qui ne bouclent plus
quand un membre part, une personne comptée deux fois quand deux regroupements
la contiennent.

## Décision

1. **L'unité comptable est la personne.** `expense_payers`,
   `expense_beneficiaries`, `expense_allocations` et `settlements` ne
   référencent que des `participants`. Aucune table ne porte un montant au
   niveau d'un regroupement — c'est une contrainte de schéma, pas une
   discipline.
2. **Un regroupement est un raccourci de sélection et une vue.** Sélectionner
   « Famille Martin » coche ses membres ; `resolveSelection` dédoublonne, et
   une personne retirée à la main reste retirée même si l'on recoche le
   regroupement. Le solde « de la famille » est la somme d'affichage des
   soldes de ses membres tels qu'ils sont **aujourd'hui**, le détail individuel
   dessous.
3. **La composition est figée sur chaque dépense validée.**
   `expense_group_snapshots` garde le nom et les membres du regroupement au
   moment de la validation ; `expense_beneficiaries.via_group_id` garde d'où
   chaque personne est venue. Modifier ou supprimer un regroupement plus tard
   ne touche ni les allocations ni cette trace.
4. **Le mot est une clé de traduction.** « Regroupement » vit dans
   `messages.ts` ; le modèle dit `participant_groups`. Changer le mot ne
   change rien d'autre.

## Conséquences

Une personne peut appartenir à plusieurs regroupements ; comparer deux
regroupements qui se recouvrent compte cette personne dans chacun, parce
qu'on les compare, on ne les additionne pas — l'écran le dit.

Supprimer un regroupement est sans danger : ses membres, leurs dépenses et
leurs soldes restent. Archiver une personne la retire des sélections futures ;
ses montants passés restent comptés, sinon l'espace cesserait de boucler.

## Ce qu'on écarte

**Un regroupement bénéficiaire avec ventilation automatique stockée.** C'est
un montant au niveau du regroupement, avec tous les problèmes ci-dessus.

**Historiser la composition du regroupement lui-même** (table temporelle).
Plus lourd, et inutile : ce qui doit rester vrai, c'est la dépense, pas la
chronique du regroupement.
