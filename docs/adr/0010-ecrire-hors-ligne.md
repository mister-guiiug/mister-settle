# 0010 — Écrire hors ligne : une file, sur le port, pas dans l'adaptateur

## Contexte

Le socle porte trois pièces pour l'écriture hors ligne : `sync-queue`,
`react/use-offline-queue` et `react/sync-status-badge`. Relevé du 06/09/2026
sur les copies de travail du parc — `sync-queue` a **trois** adoptants
(miss-uwh, miss-lookhouse, mister-doc), `react/sync-status-badge` **un**
(mister-doc), `react/use-offline-queue` **zéro**. La file elle-même est une
promotion : elle vient de miss-uwh, et la copie qu'en avait faite miss-lookhouse
(« Inspiré du syncQueue de miss-uwh ») avait **perdu le retrait exponentiel** —
chaque échec y attendait le prochain évènement `online`, qui ne vient jamais
quand c'est le serveur qui tousse. C'est le destin de tout code recopié.

Ce qui manquait, c'est le **branchement** : comment un port d'application se
pose sur cette file. Trois applications l'ont écrit chacune de leur côté, et le
squelette — d'où sortent toutes les naissances — ne le portait pas. Sans lui,
mister-doc reste en lecture seule hors ligne (`idbCache.ts`,
`OfflineBanner.tsx`), miss-carbook affiche « hors connexion, l'application ne
fonctionne pas », et chaque nouvelle application recommence.

## Décision

**La file enveloppe le port, pas l'adaptateur** —
`createQueuedNotes(createSupabaseNotes())` dans `backend/index.ts`.
L'adaptateur Supabase ne sait pas qu'une file existe : il ne sait qu'écrire une
ligne. La file, elle, ne sait pas vers quoi elle rejoue. C'est ce qui rend le
motif vrai du prochain adaptateur — Firebase, HTTP — sans une ligne de plus, et
c'est la raison pour laquelle le port parle en **mutations** depuis l'ADR
[0004](./0004-backend.md) : sans `add`/`remove`, il n'y aurait rien à enfiler.

**La promesse de `add()` change de sens : elle veut dire « accepté », pas
« écrit ».** C'est le cœur de la décision, et son coût. Le magasin restaurait
l'état d'avant quand l'écriture rejetait (ADR
[0002](./0002-etat-et-persistance.md)) ; il ne le fera plus pour une mutation
enfilée, parce qu'annuler à l'écran une note écrite hors ligne est exactement ce
qu'on cherche à éviter. Le rejet reste possible et reste visible — voir plus
bas.

**Ce qui nomme une ligne est enfilé ; ce qui remplace tout ne l'est pas.**
`add` et `remove` passent par la file. `import` et `clear` vont droit au
transport et échouent hors ligne, en le disant. Rejouer « efface tout » une
heure plus tard emporterait ce qui a été écrit entre-temps, ici ou sur un autre
appareil : une file d'attente n'est sûre que pour des gestes qui désignent leur
ligne.

**Une note, une opération en attente.** `keyOf` rend `note:<id>` : ajoutée puis
retirée hors ligne, seule la suppression part — celle d'une ligne que le serveur
n'a jamais vue ne touche rien, et l'état final est le bon. Deux entrées auraient
envoyé une insertion qu'on s'apprête à défaire.

**Un refus durable ne se rejoue pas.** `classifyBackendError` du socle lit le
message : un refus de permission (RLS, session expirée) part en **lettre morte**
au premier essai. Tout le reste est réessayé, en retrait exponentiel dispersé,
et `maxAttempts` borne même les échecs « transitoires » — une erreur mal classée
bloquerait sinon la file pour toujours, en silence. C'est la panne que ce module
refuse d'avoir : une file qui boucle ne se répare jamais toute seule.

**Et l'écran le dit, sinon la file ment.** `SyncStatusBadge` du socle porte
l'état en continu — « Hors ligne » dès la coupure, « En attente (N) » pendant le
rejeu — et un bandeau annonce les refus durables avec les deux seules suites
possibles : **réessayer** (les lettres mortes repartent en tête de file,
compteurs remis à zéro) ou **abandonner**, ce qui relit le serveur et fait
disparaître de l'écran ce qu'il n'a jamais accepté. Une promesse muette qui
échoue est pire que pas de promesse.

**Le mode local n'a pas de file.** Entre l'application et `localStorage`, il n'y
a pas de réseau : une file n'y ajouterait qu'un délai et un moyen de perdre une
note au rechargement, puisque l'écriture n'aurait pas encore eu lieu.
`notesSync` est `null`, et l'indicateur n'est pas rendu — un badge « à jour »
qui n'attend jamais rien serait du décor.

## Ce que les tests prouvent, et où

`src/backend/queued-notes.test.ts`, contre un port de comptoir — donc vrai du
prochain adaptateur :

- une note écrite hors ligne est **retenue**, et part au retour du réseau ;
- **la file survit à un rechargement** : une instance neuve sur le même préfixe
  retrouve l'écriture. C'est le seul scénario qui distingue une vraie file d'un
  tableau qui vit dans une fermeture ;
- une mutation **refusée par la RLS finit en lettre morte** dès le premier
  essai, l'instantané le dit, **et la file continue** — une tête bloquante
  emporterait tout ce qui suit ;
- un **échec de réseau**, lui, est réessayé sans consommer la note ;
- ajoutée puis retirée hors ligne, **une seule opération part** ;
- `import` et `clear` **ne passent pas** par la file.

`e2e/smoke.spec.ts`, `@critical` : réseau coupé, l'application répond encore, le
geste aboutit, la coupure est annoncée, et la note est là au retour — après un
démarrage à froid.

**Ce que l'e2e ne prouve pas, et il faut l'écrire.** Le squelette démarre sans
configuration : ses e2e tournent en mode local, où il n'y a pas de file. Le
rejeu lui-même n'est donc prouvé qu'au niveau du port. Le prouver de bout en
bout demanderait un second build portant `VITE_SUPABASE_*` et un faux transport
intercepté par Playwright — deux serveurs de test, un décor d'authentification
simulé, et une suite qui casse au prochain changement du SDK. Une application
née de ce squelette **et qui a un backend** peut, elle, l'écrire pour de bon :
c'est le bon endroit.

## Conséquences

- Une note écrite dans un ascenseur part toute seule à la sortie, sans que
  personne ait à y penser.
- **Une écriture peut être refusée après coup.** L'écran l'a affichée, le
  serveur la rejette : le bandeau le dit et propose d'abandonner, ce qui relit
  la vérité du serveur. C'est le prix de l'écriture optimiste différée, et il
  est payé visiblement.
- **La file grossit dans le stockage.** Plafond à deux cents entrées (défaut du
  socle) ; au-delà, `enqueue` refuse et le magasin restaure l'état d'avant en
  portant l'erreur — refuser visiblement vaut mieux que jeter en silence.
- **La lecture n'est pas mise en file.** Hors ligne, c'est le service worker qui
  répond, ou l'appel échoue et l'écran le dit. Un cache de lecture est une autre
  décision, que ce squelette ne prend pas.
- Une application qui ajoute un port distant doit décider, port par port, ce qui
  s'enfile. La règle est écrite ici : ce qui nomme une ligne, oui ; ce qui
  remplace tout, non.

## Ce que ça écarte

- **`react/use-offline-queue` du socle** — la variante React de la même idée.
  Elle vit _dans_ l'arbre React et n'a ni la fusion par entité, ni les lettres
  mortes rejouables, ni le retrait automatique entre deux passages en ligne. La
  file d'un backend n'appartient pas à un composant : elle doit survivre au
  démontage de l'écran qui l'a remplie. Le refus est inscrit ici pour qu'il ne
  compte pas comme une dette d'adoption.
- **Un CRDT**, ou toute fusion automatique de deux versions concurrentes. Le
  squelette n'a pas de métier ; les notes sont personnelles et sans conflit
  possible. Une application dont deux utilisateurs touchent la même ligne doit
  trancher **et l'écrire** — comme mister-doc, dont un créneau n'a qu'un
  occupant.
- **Une file pour la lecture** (cache hors ligne). Mister-doc l'a
  (`idbCache.ts`) ; c'est un autre problème, et le service worker en couvre
  déjà l'essentiel ici.
- **Attendre le serveur avant d'afficher.** Ce serait rendre l'application
  local-first inutilement lente, et c'est déjà écarté par l'ADR 0002.
