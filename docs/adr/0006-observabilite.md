# 0006 — Journal toujours, Sentry seulement s'il est configuré

## Contexte

`createLogger` du socle avait **un adoptant sur dix-sept** ; en face, le parc
portait **trente-huit `console.error` / `console.warn` orphelins** dans treize
applications. Un message dans la console d'un navigateur qu'on n'a pas sous la
main n'aide personne.

Le second défaut est plus subtil : brancher Sentry « au cas où » alourdit le
bundle de toutes les applications, y compris celles qui n'ont pas de DSN.

## Décision

Trois couches, chacune avec sa condition :

- **`installErrorReporter()` avant tout le reste**, dans `main.tsx`. Une erreur
  levée au montage doit déjà être capturée : la seule panne qu'on ne verra
  jamais est celle qui empêche l'application de s'afficher ;
- **`createLogger(domaine)`** partout où l'on serait tenté d'écrire
  `console.*` ;
- **`initSentry({ dsn })`**, qui ne fait rien sans DSN et ne charge alors pas
  une ligne de Sentry.

L'arbre est enveloppé dans `ObservabilityBoundary`.

## Conséquences

Le bundle d'une application sans observabilité reste intact — c'est vérifiable
au budget de poids. Une application qui pose son DSN gagne le relais sans
changer une ligne de code.

Le journal local garde les cinquante dernières erreurs dans `localStorage`,
piles comprises. **Tout script exécuté sur l'origine peut les lire** : n'y
placer aucun contexte sensible. C'est écrit dans la politique de sécurité du
socle, et répété ici parce que c'est le genre de limite qu'on redécouvre.

## Ce qu'on écarte

**Sentry inconditionnel.** Il ferait payer l'observabilité aux applications qui
n'en ont pas.

**`console.*` « juste pour déboguer ».** C'est l'intention de chacun des
trente-huit appels relevés.
