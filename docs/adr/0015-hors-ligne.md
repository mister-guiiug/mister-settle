# 0015 — Hors ligne : lire ce qu'on a ouvert, écrire des brouillons, mettre en file la création

## Contexte

Le socle fournit la file d'écritures (`sync-queue` : persistante, drain
sérialisé, lettres mortes, fusion par clé d'entité) et l'ADR 0010 du squelette
la pose sur le port. Il ne fournit **aucune résolution de conflit** : deux
appareils qui modifient la même dépense hors ligne se verraient appliquer la
dernière écriture arrivée, sans que personne ne le sache. Et le rattrapage du
temps réel (`catchUp`) n'applique pas le filtre d'espace — documenté dans le
README du socle.

Une dépense partagée est précisément une donnée que **d'autres** modifient.

## Décision

1. **Lecture hors ligne** : le dernier état lu de chaque espace ouvert est
   gardé dans IndexedDB (`createIdb`), validé par les schémas Zod à la
   relecture. L'écran dit qu'il montre une copie et de quand.
2. **Brouillons locaux** : un brouillon de dépense vit dans un magasin versionné
   local tant qu'il n'est pas enregistré ; il ne part nulle part sans réseau,
   et ne compte dans aucun solde.
3. **La création de dépense est mise en file**, et elle seule au MVP. Elle
   est idempotente par construction : l'identifiant est engendré côté client
   (`createUuid`) et sert de clé primaire — un rejeu n'insère pas deux fois.
   Une entrée rejetée durablement (RLS, version) devient une lettre morte que
   l'écran **explique** avec deux issues : recharger et refaire, ou abandonner.
4. **Toute modification concurrente est un conflit explicite.** Les agrégats
   portent une colonne `version` ; `save_expense` et `validate_expense`
   refusent une version périmée. Il n'y a pas de fusion automatique : la
   personne relit la dépense telle qu'elle est devenue, puis décide.
5. **Le temps réel viendra après** (V1.1), en n'utilisant que `connect` et en
   rechargeant la requête filtrée de l'écran à chaque retour `live`.

## Conséquences

Un utilisateur hors ligne peut consulter, préparer, et créer ; il ne peut ni
valider une répartition — la validation est serveur —, ni déclarer un
remboursement, ni inviter. `useActionGuard({ online: true })` désactive ces
boutons **en disant pourquoi**, au lieu de les cacher.

`SyncStatusBadge` porte l'état : synchronisé, N en attente, hors ligne, erreur.

## Ce qu'on écarte

**Une file générale de toutes les mutations.** Sans résolution de conflit, elle
ferait perdre des modifications en silence — le contraire de ce qu'on attend
d'une application de comptes.

**Une fusion automatique « dernière écriture gagne ».** Elle est facile et
fausse ; une dépense est une donnée à plusieurs mains.
