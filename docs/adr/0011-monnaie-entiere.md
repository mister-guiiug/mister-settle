# 0011 — La monnaie est un entier, et l'arithmétique vit deux fois

## Contexte

Le socle formate un montant (`format.js`, `fmt.currency`) mais ne calcule
rien : au 07/09/2026, les seules occurrences de « centime », « décimal » ou
« devise » dans ses cent cinquante sous-chemins sont dans le formatage et le
dialecte CSV. Or une application de dépenses partagées n'a qu'un seul
invariant qui compte : **la somme des parts est exactement le montant**. Un
flottant JavaScript ne sait pas le tenir — `0.1 + 0.2` n'est pas `0.3`, et
`90 / 3` le paraît seulement.

## Décision

1. **Un montant est un entier d'unités mineures** (`Minor`, un `number` sûr) :
   des centimes pour l'euro, rien pour le yen, des millièmes pour le dinar.
   La devise dit combien de décimales (`minorUnitOf`) ; `parseAmount` refuse
   une saisie qui en porte davantage plutôt que d'arrondir un centime que
   personne n'a tapé.
2. **Les parts sont des entiers aussi**, à quatre décimales mises à l'échelle
   (`SHARES_SCALE`) — ce que `numeric(10,4)` stocke sans perte. Les produits
   `total × part` passent par `BigInt`.
3. **Le flottant n'existe qu'au bord**, pour `Intl.NumberFormat`
   (`toDisplayNumber`), et n'est jamais réinjecté dans un calcul. Vers la base,
   un montant s'écrit et se relit en **chaîne décimale** (`toDecimalString`,
   `fromDecimalString`), jamais en `number`.
4. **L'arithmétique de répartition existe en deux exemplaires** : en
   TypeScript (`src/domain/split.ts`) pour l'écran et le repli local, en SQL
   (`validate_expense`) pour la validation serveur — et les deux sont éprouvés
   sur les **mêmes cas** (Vitest et pgTAP, mêmes attendus). Le serveur ne fait
   pas confiance au client : il recalcule.

## Conséquences

Chaque écran qui affiche un montant passe par `fmt.currency(toDisplayNumber(…))`
— une ligne de plus, et l'assurance que le chiffre affiché est celui qui a été
compté. Les tests de propriété (`split.test.ts`) rejouent des centaines de
répartitions et affirment la somme exacte à chaque fois.

Le prix : deux implémentations à tenir d'accord. Un cas ajouté d'un côté
s'ajoute de l'autre ; c'est une règle de relecture, et les tests croisés en
sont le filet.

## Ce qu'on écarte

**Une bibliothèque décimale** (`decimal.js`, `big.js`). Elle résoudrait le
problème d'affichage sans résoudre celui de la somme exacte, ajouterait une
dépendance que le socle ne connaît pas, et masquerait l'invariant derrière une
API — alors que l'entier le rend lisible.

**Stocker les montants en `double precision`.** `numeric(14,2)` compare et
additionne exactement ; c'est ce qu'une contrainte `check` doit pouvoir faire.
