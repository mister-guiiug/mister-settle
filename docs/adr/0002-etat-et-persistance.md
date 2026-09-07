# 0002 — Zustand pour l'état vivant, magasin versionné pour ce qui survit

## Contexte

Treize applications sur dix-sept utilisent Zustand ; aucune n'avait la même
façon de persister. Le relevé a trouvé **sept `storage.ts` maison**, chacun
écrivant du JSON dans `localStorage` sans version ni validation.

Le défaut qu'aucun ne traite est le même partout : le jour où le modèle change,
la donnée écrite par la version d'avant est soit ignorée en silence, soit
lue de travers. Et le jour où un utilisateur ouvre une version ANTÉRIEURE de
l'application, elle écrase la donnée qu'elle ne comprend pas.

## Décision

Deux couches, séparées :

- **Zustand** pour l'état vivant de l'écran, sans persistance dedans ;
- **`versioned-store` du socle** pour ce qui survit au rechargement, appelé
  derrière un port (cf. [0004](./0004-backend.md)).

Le magasin versionné enveloppe la donnée dans `{ v, data }`, applique des
migrations qui montent d'un cran, valide par le schéma zod de l'application, et
**copie de côté avant toute perte possible**.

## Conséquences

Le magasin d'écran est testable sans stockage, et la persistance est testable
sans React. Le test de `store.test.ts` traverse pourtant la chaîne complète
sans rien simuler — c'est possible parce que le repli local ne demande aucune
configuration.

Le prix : une migration doit être écrite quand le modèle change. C'est le
travail que les sept magasins maison ne faisaient pas, et son absence ne se
voit qu'en production, chez celui qui n'a pas rechargé depuis un mois.

## Ce qu'on écarte

**`persist` de Zustand.** Il persiste, mais ne versionne pas la donnée avec une
chaîne de migrations, et ne met rien de côté avant d'écraser.

**`backup` du socle.** Zéro adoptant, et pour une raison écrite : il sauvegarde
la carte brute de `localStorage`, ce qui n'est pas le besoin. La réponse est
`versioned-store`.
