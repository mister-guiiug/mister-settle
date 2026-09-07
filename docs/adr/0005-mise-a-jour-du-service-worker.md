# 0005 — `prompt`, jamais `autoUpdate`

## Contexte

Trois applications du parc enregistraient leur service worker en
`registerType: 'autoUpdate'`. Ce mode recharge la page dès qu'une nouvelle
version est prête, **sans rien demander**. L'une des trois est un chronomètre
de contractions : le rechargement pouvait tomber au milieu d'une saisie, dans
le cas d'usage même de l'application.

Symétriquement, une PWA installée et laissée ouverte plusieurs jours ne
découvre rien : sans vérification périodique, elle ne cherche une nouvelle
version qu'à son prochain démarrage à froid.

## Décision

`registerType: 'prompt'` — c'est le défaut de `pwaBaseOptions` — plus
`AppUpdates` du socle avec `checkEvery="1h"`.

Le fournisseur tient l'enregistrement, le bandeau et le report en un seul
endroit : `registerSW` se donne une fois, pas à chaque composant qui voudrait
savoir s'il y a une mise à jour.

## Conséquences

Une nouvelle version se propose ; elle ne s'impose pas. L'utilisateur choisit
le moment, ce qui rend le déploiement continu compatible avec une saisie en
cours.

Le prix : quelqu'un peut rester sur une version ancienne indéfiniment s'il
ignore le bandeau. `snoozeKey` permet de reporter proprement plutôt que de
laisser le bandeau revenir sans fin — un report explicite vaut mieux qu'un
bandeau qu'on apprend à ignorer.

## Ce qu'on écarte

**`autoUpdate`.** Il reste défendable pour une application sans état de saisie,
et le socle le permet. Mais il doit alors être une décision écrite, pas un
défaut hérité du gabarit de `vite-plugin-pwa` — c'est ainsi que les trois cas
du parc sont arrivés.

**Ne rien vérifier périodiquement.** C'est le comportement par défaut, et il
transforme « déploiement continu » en « déploiement au prochain redémarrage ».
