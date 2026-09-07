# 0009 — Effacer son compte, pas seulement ses données

## Contexte

Relevé du 06/09/2026 sur le parc. Dix applications ont des comptes ; **deux**
offrent une voie d'effacement à l'utilisateur : mister-doc (par anonymisation,
`anonymize_doctor` + `PrivacyCard.tsx`) et mister-family-map (port
`requestAccountDeletion`). Les huit autres n'en ont aucune — miss-uwh (dont
`wipeLocal` ne purge que le miroir local), mister-molkky, miss-lookhouse,
mister-miss-koh (« reste à faire » dans son README), miss-carbook (dont le
README renvoie « au fournisseur »), mister-footcoach, mister-qowa,
miss-ticket-pwa. Et le squelette n'offrait que `signOut`.

C'est une obligation, pas un confort : l'article 17 du RGPD donne un droit à
l'effacement, et « écrire au mainteneur » n'est pas une voie d'exercice
acceptable pour une application qu'on installe en un clic.

Une réserve bloquait ce chantier depuis le 05/09/2026, écrite dans
`AMELIORATIONS.md` du socle : **personne n'avait jamais vérifié qu'une fonction
`security definer` pouvait effacer une ligne d'`auth.users` sur un projet
hébergé.** Supabase le documente, mister-doc s'en sert en production dans trois
migrations (`0008_self_service.sql`, `0010_admin_reject.sql`,
`0019_anonymize_doctor.sql`) — et aucune assertion, nulle part sur le parc, ne
le prouvait.

## Décision

**Le squelette efface. Il n'anonymise pas — et il dit pourquoi.**

`public.delete_my_account()` (migration `0005`) supprime les données de
l'utilisateur courant, puis son compte dans `auth.users`. Elle est
`security definer`, sans argument (l'identité vient de `auth.uid()`, jamais du
client), et son droit d'exécution est retiré à `public`/`anon` puis rendu au
seul `authenticated`.

**Ce que l'effacement demande d'écrire, et qu'une cascade ne dit pas.** Les
tables sont nommées une par une (`notes`, `user_roles`, `profiles`) alors que la
cascade d'`auth.users` les emporterait toutes. C'est délibéré : le jour où une
application ajoute une table en `on delete set null`, sans clé étrangère, ou une
pièce dans le stockage, la cascade ne la voit pas et la donnée survit à son
auteur. Cette liste est l'endroit où on la complète, et elle se relit.

**Effacer, et non anonymiser, est un choix de MODÈLE, pas une doctrine.**
Mister-doc anonymise parce qu'il ne _peut pas_ effacer : les gardes passées d'un
médecin sont rattachées à sa fiche en `on delete cascade`, et supprimer la fiche
détruirait le planning de tout le service. Ici, rien de ce que possède un compte
n'appartient à quelqu'un d'autre. Une application dont les données survivent à
leur auteur doit anonymiser — sur le modèle de `mister-doc/src/backend/gdpr.ts`
et de sa migration `0019` — et l'écrire dans son propre ADR.

**Le geste demandé est délibéré : retaper son adresse.** Le squelette vient de
décider l'inverse pour les suppressions courantes (ADR
[0008](./0008-annuler-plutot-que-confirmer.md) : annuler plutôt que confirmer).
Un compte effacé ne se rattrape pas : il n'y a rien à remettre à sa place, et un
sursis de huit secondes serait un mensonge. C'est le seul geste du squelette qui
mérite une barrière — et une barrière à « OK » n'en est pas une : c'est le même
clic que celui qu'on regrette, deux fois de suite. Retaper l'adresse du compte
demande de **lire**, donc de comprendre.

L'adresse mal retapée ne grise pas le bouton, elle **répond** : un bouton
désactivé sans explication laisse chercher ce qui manque, et un lecteur d'écran
n'annonce qu'« indisponible ». La soumission reste possible, et c'est le refus
qui est dit, dans un `role="alert"`.

**Trois gestes, dans cet ordre — c'est le contrat, pas une implémentation.**

1. **La base d'abord.** Un refus lève, et rien d'autre n'est touché :
   l'utilisateur reste connecté, voit l'erreur, recommence. L'inverse laisserait
   un compte intact et quelqu'un dehors.
2. **Le miroir local ensuite.** Le magasin versionné peut porter des notes
   écrites avant qu'un backend ne soit configuré sur cet appareil : la base ne
   les voit pas, et « supprimer mon compte » ne peut pas les laisser à l'écran
   suivant. Le thème et la langue restent — ce sont des préférences d'appareil.
3. **La session en dernier, en portée locale.** Une déconnexion globale demande
   au serveur de révoquer les jetons d'un compte qui n'existe plus : elle
   échoue, et l'application garde une session qui ne mène nulle part.
   `signOut({ scope: 'local' })` est la seule qui puisse suivre une suppression.

**Ce n'est pas un port**, et c'est délibéré. `Backend` décrit ce dont
l'application a besoin quel que soit le fournisseur ; l'effacement d'un compte
n'existe pas en mode local, où il n'y a pas de compte. Le déclarer au port
obligerait l'adaptateur local à implémenter un geste sans objet.

## La preuve, et ce qu'elle couvre exactement

`supabase/tests/suppression-compte.test.sql` — dix-huit assertions pgTAP,
jouées par `pwa-supabase-test.yml` sur une pile jetable à chaque changement de
migration. Il vérifie **le mécanisme** autant que le résultat, parce qu'un test
vert ne dirait sinon pas si l'effacement vient de la fonction ou de la session
de test, qui tourne sous `postgres` et pourrait tout faire :

- la fonction appartient à `postgres` et porte bien `security definer` ;
- `anon` ne peut même pas l'appeler ;
- **la session d'un utilisateur connecté ne peut PAS toucher `auth.users` par
  elle-même** — et peut effacer son compte par la fonction ;
- le décor est **compté avant** : « plus une ligne » est vrai d'une base vide ;
- le compte du voisin est intact après coup.

Deux assertions ferment l'écart qui rendait la réserve légitime : la pile locale
est plus permissive qu'un projet hébergé, et voir la fonction réussir n'y
prouverait rien si elle réussissait **par contournement**. Elles nomment donc
d'où vient le droit — `bypassrls` porté par `postgres` pour les tables
applicatives, un `grant` explicite (ou la propriété de la table) pour
`auth.users`. Ni l'un ni l'autre n'est un privilège de superutilisateur, dont
`postgres` ne dispose pas en hébergé : **ce qui passe sur la pile jetable passe
donc pour la même raison sur un projet hébergé.**

Ce que la preuve ne couvre pas, et qu'il faut dire : elle est jouée sur une pile
Supabase locale, pas sur un projet hébergé. Elle établit que le mécanisme
invoqué n'est pas un privilège de superutilisateur ; elle n'est pas un appel
réel contre `api.supabase.com`.

## Conséquences

- Le droit à l'effacement s'exerce depuis l'application, sans écrire à
  personne — sur huit applications du parc par reprise du motif.
- **Un compte effacé libère son adresse.** Une réinscription avec la même
  adresse crée un compte neuf, sans rien de l'ancien. C'est voulu, et c'est
  visible.
- **La liste des tables est une dette d'entretien.** Une application qui ajoute
  une table possédée par l'utilisateur doit l'ajouter à `delete_my_account()`.
  Le pgTAP est l'endroit où l'oubli se voit : ajouter la table au décor et
  l'assertion « plus une ligne » qui va avec.
- **La carte n'existe pas en mode local**, et l'e2e le fige. Un « supprimer mon
  compte » qui n'efface rien serait pire que son absence.
- La session est coupée localement : sur un autre appareil, un jeton déjà émis
  reste syntaxiquement valide jusqu'à son expiration (une heure par défaut,
  `supabase/config.toml`). Il ne donne plus accès à rien — les lignes ont
  disparu, et la RLS filtre sur un `auth.uid()` qui ne correspond plus à aucune
  donnée — mais l'application, elle, ne le sait pas encore. C'est le prix des
  jetons sans état, et il n'est pas payé par les données.

## Ce que ça écarte

- **La suppression par courriel**, ou par formulaire de contact : ce n'est pas
  une voie d'exercice, c'est une file d'attente.
- **L'anonymisation par défaut.** Elle est le bon geste pour un modèle dont les
  données survivent à leur auteur ; elle laisse sinon des lignes qu'on a promis
  d'effacer, et elle est plus difficile à prouver — « plus une ligne » se compte,
  « plus rien d'identifiant » se discute.
- **Une suppression différée** (« votre compte sera effacé sous trente jours »).
  Elle demande un ordonnanceur, un état intermédiaire et un écran de
  rétractation : trois décisions pour un squelette qui n'a pas de métier.
- **L'export préalable obligatoire.** L'écran de réglages exporte déjà
  (`versioned-store.export()`) ; l'imposer avant l'effacement transformerait un
  droit en parcours.
- **Un appel à l'API d'administration** (`auth.admin.deleteUser`) : elle exige
  la clé `service_role`, qui ne peut pas vivre dans un bundle servi par GitHub
  Pages. C'est précisément ce que la fonction `security definer` remplace.
