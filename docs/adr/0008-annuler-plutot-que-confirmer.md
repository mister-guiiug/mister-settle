# 0008 — Annuler plutôt que confirmer

## Contexte

Relevé du 06/09/2026 sur les dix-sept applications du parc :

- `ConfirmDialog` du socle est adopté par **quatorze** applications ;
- `useUndoableState` du socle par **zéro** ;
- **aucune** application n'offre d'annulation après la suppression d'un
  enregistrement. Miss-contraction a un bandeau maison de trente secondes après
  _enregistrement_ (`Banners.tsx`, `UNDO_MS`), pas après suppression ;
  miss-badminton, mister-molkky et miss-dice annulent un _coup_, pas une ligne
  d'historique. Mister-miss-koh et mister-family-map font une suppression
  logique (`deleted_at`, `deletedAt`) **sans écran de restauration** : la donnée
  est là, et personne ne peut la ramener.

Le squelette lui-même supprimait une note derrière un `ConfirmDialog`.

Ce que coûte un dialogue de confirmation est mesurable, et ce n'est pas ce
qu'on croit. Il demande de se décider **avant**, sur une action dont on ne voit
pas encore le résultat ; il apparaît à chaque geste, y compris les milliers de
gestes voulus ; et il finit par être cliqué sans être lu — c'est exactement à ce
moment-là qu'il ne protège plus rien. Le dialogue rend le geste **lent**, il ne
le rend pas **réversible**.

## Décision

**La suppression d'une note ne demande plus rien, et devient annulable pendant
huit secondes.** Le dialogue de confirmation disparaît sur ce geste :
`ConfirmDialog` reste pour ce qui est vraiment irréversible et massif (« Tout
effacer », « Remplacer les notes actuelles » dans les réglages), pas pour une
ligne.

Trois règles portent la mécanique :

1. **Le magasin tient la minuterie, pas l'écran.** `remove(id)` retire la note
   de la liste et n'écrit rien ; la suppression n'atteint le port qu'à
   l'expiration du sursis (`UNDO_MS`), ou quand celui-ci est soldé.
2. **Un seul sursis à la fois.** Une seconde suppression **solde** la première
   au lieu de l'empiler. Deux notes remises « à leur place » dans le désordre
   n'atterrissent pas où elles étaient — et le squelette n'a pas à trancher ce
   cas pour toutes ses filles. L'annulation reste vraie pour le dernier geste,
   celui qu'on regrette.
3. **Quitter l'écran solde le sursis.** Sans cette règle, changer d'onglet
   pendant les huit secondes emporterait la minuterie avec le composant :
   l'écran aurait perdu la note, la base l'aurait gardée, et elle réapparaîtrait
   au prochain chargement sans explication. C'est la panne la plus coûteuse de
   ce motif, parce qu'elle est silencieuse.

La notification n'est **que** l'affichage : elle est posée en `duration: 0`
(permanente) et fermée par l'écran quand le sursis s'achève. Deux minuteries
indépendantes se désynchroniseraient au premier survol — le socle suspend la
sienne (WCAG 2.2.1) et pas celle du magasin —, et « Annuler » resterait
affiché, cliquable, et sans effet.

## Conséquences

- Une suppression par erreur se rattrape, sans dialogue préalable à chaque
  geste. C'est la seule chose que le dialogue ne savait pas faire.
- **Un rechargement pendant le sursis annule la suppression.** Rien n'ayant été
  écrit, la note est toujours dans le magasin. C'est le côté sûr de
  l'arbitrage : on ne perd jamais une donnée par accident. Il faut l'écrire,
  parce que c'est visible et que ça surprend.
- **Le bouton « Annuler » vit dans la zone de notification**, donc en fin
  d'ordre de tabulation. La région est annoncée (`aria-live="polite"`,
  `role="status"` — le socle le garantit), mais un utilisateur au clavier a
  huit secondes pour l'atteindre. C'est court. Le sursis reste un **gain** sur
  l'état d'avant, où la suppression était immédiate et définitive : rien n'est
  _exigé_ dans la fenêtre.
- **La zone de notification du socle recouvre la barre basse fixe** (`z-index`
  70 contre 20, toutes deux en `bottom: 0`). Le squelette la remonte dans
  `src/index.css` de la hauteur que `reserve="bottom-nav"` réserve déjà. C'est
  le même défaut que le bandeau de mise à jour passant _sous_ la barre chez
  mister-miss-koh : il appartient au socle, et ces quatre lignes disparaîtront
  le jour où il saura placer sa zone au-dessus d'une barre déclarée.
- L'écriture est retardée de huit secondes. Sur un backend distant, cela
  déplace la fenêtre d'échec : une suppression peut être refusée alors que
  l'écran l'affiche déjà comme faite. Le magasin rend alors la note **à sa
  place** et porte l'erreur — c'est la règle du squelette depuis toujours
  (ADR [0002](./0002-etat-et-persistance.md)), et elle vaut ici aussi.

## Ce que ça écarte

- **Une corbeille généralisée** (suppression logique + écran de restauration).
  Elle demande une colonne, une politique RLS, un écran et une purge — quatre
  décisions pour un squelette qui n'a pas de métier. Une application dont les
  enregistrements coûtent cher à reconstruire doit la faire, et l'écrire.
- **`useUndoableState` du socle.** Il tient un historique d'états successifs
  avec persistance optionnelle — ce qu'il faut pour annuler un _coup_ dans un
  jeu (miss-dice, mister-molkky). Ici il n'y a pas d'historique à empiler : il y
  a **une écriture retardée**, et c'est le port qu'il faut retenir, pas l'état.
  Le composant n'aurait rien porté du problème.
- **Confirmer ET annuler.** Les deux ensemble donnent un dialogue qu'on clique
  sans lire, suivi d'un bouton qu'on ne voit pas. Annuler **remplace**
  confirmer.

## Ce qui se simplifiera

Le `toast` du socle n'a **pas d'action** au 06/09/2026 : le bouton « Annuler »
est passé dans le `ReactNode` du message, et l'écran ferme la notification à la
main quand le sursis s'achève. Le jour où `react/toast` acceptera une `action`
et rendra la fin de vie de la notification observable, le motif tiendra en un
appel — `toast.show(message, { action, duration })` — et l'effet de fermeture de
`HomeScreen` disparaîtra. Le contrat du magasin, lui, ne bougera pas : c'est lui
qui doit tenir la minuterie, quelle que soit la façon dont on l'affiche.
