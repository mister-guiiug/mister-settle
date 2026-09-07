# 0013 — Une répartition se valide explicitement, sur une empreinte de calcul

## Contexte

Une dépense mal répartie fausse les soldes de tout le monde, et personne ne le
voit avant le moment de se rembourser. Le cahier des charges exige une étape
de synthèse et une action explicite « Valider cette répartition », et que
toute modification qui influe sur le calcul fasse tomber la validation.

La difficulté n'est pas le bouton : c'est de dire **exactement** ce qui
invalide, et de le dire pareil dans l'écran, dans le repli local et dans la
base.

## Décision

1. **Trois états** : `draft`, `validated`, `archived`. Seul `validated` entre
   dans les soldes. Un brouillon est visible et marqué, jamais compté.
2. **L'empreinte de calcul** (`calculationFingerprint`) est la forme canonique
   de tout ce qui influe sur le résultat : montant, devise, taux, modèle,
   payeurs, bénéficiaires et leurs saisies, regroupements utilisés. Le libellé,
   la note, la catégorie, la date, les justificatifs n'en font pas partie.
3. **Valider, c'est écrire l'empreinte** avec les allocations calculées. La
   validation est courante tant que l'empreinte de la saisie est celle qui a
   été validée ; sinon la dépense retombe en `draft` et l'écran demande de
   revalider. Côté base, `save_expense` remet en `draft` toute dépense dont
   les champs calculatoires changent, et `validate_expense` **recalcule** les
   allocations en SQL avant d'accepter — le client ne les écrit jamais.
4. **Les erreurs bloquent, les avertissements s'affichent.** `checkExpense`
   rend des codes stables avec une gravité ; l'écran traduit, il n'invente pas
   de règle.

## Conséquences

L'assistant de dépense a trois étapes, et la troisième — la synthèse — montre
le montant par personne, les parts, les écarts, et l'impact prévisionnel sur
les soldes. Le bouton n'est actif que sans erreur.

Chaque validation écrit une révision (`expense_revisions`) et une ligne
d'activité : l'historique dit qui a validé quoi, et quelle répartition.

## Ce qu'on écarte

**Valider implicitement à l'enregistrement.** C'est ce que font les
applications qui laissent passer une somme fausse.

**Invalider sur n'importe quelle modification.** Renommer une dépense ne remet
pas ses parts en cause ; le faire fatiguerait l'utilisateur jusqu'à ce qu'il
valide sans lire.
