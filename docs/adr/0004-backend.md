# 0004 — Un port, un repli local, une migration port par port

## Contexte

Le socle publie `backend.js` depuis longtemps — sélection du backend, repli
local, composition port par port. **Aucune application ne l'importait.** En
face, `getSupabase` était recopié dans quatre dépôts malgré `supabase-client`,
et `env.ts` existait en trois versions différentes.

Le défaut que cela produit a été mesuré en production le 02/09/2026 : une
application publiée avec `apiKey: undefined` dans son bundle, CI verte, site en
ligne, backend injoignable — **et rien pour le dire**. Personne n'avait décidé
que l'application devait démarrer sans configuration ; elle ne le pouvait
simplement pas.

## Décision

Trois règles, dans cet ordre, portées par `createBackendSelector` :

1. un choix explicite (`VITE_BACKEND`) gagne toujours ;
2. sinon, la présence de **toutes** les variables requises décide ;
3. sinon, on retombe sur le backend local — qui est complet, pas dégradé.

Un choix explicite **inconnu** est ignoré : mieux vaut démarrer en local
qu'échouer sur une faute de frappe dans un `.env`.

Les adaptateurs distants remplacent les ports **un par un** : `create` rend un
objet partiel, et les ports absents restent locaux.

## Conséquences

L'application tourne hors ligne, en test, dans une CI sans secrets, et sur la
page publique qu'un visiteur ouvre sans compte. Les tests unitaires traversent
la persistance réelle sans rien simuler.

Le repli devient en revanche **invisible** s'il n'est pas affiché : quelqu'un
peut croire son compte distant actif alors que tout reste sur l'appareil. C'est
pourquoi l'écran de réglages montre `coverage` et `configReport()` — le
troisième garde, celui qui parle d'un build **déjà en ligne**, après celui du
déploiement (`required-env`) et celui du build.

Une application à moitié migrée doit pouvoir le dire. C'est le sens de
`backendCoverage` : quels ports sont distants, lesquels sont restés locaux.

## Ce que l'écriture de l'adaptateur distant a appris

La première version du port était **synchrone** — `load(): NotesSnapshot` —
parce que l'implémentation locale l'est. Elle était donc **inimplémentable par
un adaptateur distant**, et cela n'est apparu qu'en écrivant celui de Supabase.

Un port dessiné sur une seule implémentation n'est pas un port : c'est cette
implémentation, avec un autre nom. Le port est désormais asynchrone de bout en
bout, l'adaptateur local se contentant d'envelopper. Le prix — un état de
chargement même là où il n'y en a pas — est plus faible que celui de la
découverte tardive : à ce moment-là, ce sont les écrans qu'il faut reprendre.

L'écriture est **optimiste, avec reprise** : l'état change d'abord, on écrit
ensuite, et un échec restaure l'état d'avant en portant l'erreur à l'écran. Une
note affichée que la base a refusée est le pire des deux mondes.

## Ce qu'on écarte

**Exiger la configuration au démarrage.** C'est la règle inverse, et elle
interdit la démonstration publique, les tests sans secrets, et le hors-ligne.

**Un client Supabase importé directement dans les écrans.** C'est ce que font
les applications qui ne peuvent plus changer de backend sans tout réécrire.
