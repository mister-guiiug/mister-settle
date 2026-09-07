# 0007 — Comptes et droits : la base décide, l'interface se contente d'obéir

## Contexte

Le socle a le **port** d'authentification (`auth/*`), un instantané React et une
garde — et depuis la 3.33.0, le fournisseur, le formulaire et le défi MFA. Le
relevé du 05/09/2026 est pourtant sans appel : cette couche compte **dix copies
dans cinq applications, et zéro migration**. Quatre `AuthProvider` (161, 62, 218
et 119 lignes) pour le même contrat, quatre formulaires pour le même écran.

Côté base, trois dépôts portent chacun leur `profiles` + `handle_new_user` +
`touch_updated_at` + `is_admin`. `GISEMENTS.md` avait tranché : le paquet npm ne
franchit ni Deno ni Postgres, mais « la valeur n'existe qu'à la naissance d'une
application ». C'est ce moment.

Et il n'y a **rien** pour les droits : `useActionGuard` garde des actions — en
ligne, confirmé — pas des rôles.

## Décision

**Trois couches, et une seule fait autorité.**

1. **La base décide.** Les tables naissent en `enable row level security` sans
   aucune politique : un schéma poussé à moitié refuse tout au lieu d'exposer.
   `0003_rls.sql` ouvre ensuite le strict nécessaire, avec un **double verrou** —
   les droits SQL retirés puis redonnés un par un, en plus des politiques. Une
   politique mal écrite ne suffit alors pas à ouvrir une table.
2. **Les rôles ne s'attribuent pas depuis le navigateur.** `user_roles` n'a
   aucune politique d'écriture : les rôles se posent par la clé `service_role`,
   qui ne quitte jamais le serveur.
3. **`useRole()` est un confort d'interface.** Il masque un bouton que la base
   refuserait de toute façon. Ce n'est pas une autorisation.

Côté application, `AuthProvider` du socle avec l'adaptateur Supabase, et
`LoginForm` tel quel.

## Conséquences

`adapter={null}` met le fournisseur en **mode local** : l'état reste
« déconnecté » et les actions rendent `{ ok: false, code: 'local-mode' }`.
L'écran de compte existe donc toujours et **dit** qu'aucun backend n'est
configuré, au lieu de disparaître derrière une condition. Un écran masqué finit
par diverger de celui qui s'affiche, et personne ne le voit avant la mise en
service — un test e2e fige ce comportement.

Le prix : les politiques doivent être **exécutées**, pas relues. Une politique
se lit vite et se trompe de même, et c'est le seul endroit du système où une
erreur d'une ligne expose une table entière à une clé publique. D'où
`supabase/tests/rls.test.sql` en pgTAP : onze assertions qui prouvent que deux
comptes ne se voient pas, que `anon` ne voit rien, et que personne ne peut
s'attribuer un rôle.

Un piège figé dans ces tests : `set local role authenticated` est
indispensable. Sans lui, la session garde `bypassrls`, **tout passe, et le test
est vert et faux**.

## Ce qu'on écarte

**`force row level security`.** Sur Supabase, `postgres` porte `bypassrls` et
n'est pas superutilisateur : la directive ne protégerait rien et casserait les
migrations.

**Lire les rôles dans une table depuis le navigateur.** Cela ferait croire que
l'autorisation vient du client. Le rôle est lu dans le jeton, et il ne sert
qu'à l'affichage.

**Filtrer par `user_id` dans les requêtes du front.** La RLS le fait déjà.
L'ajouter donnerait l'illusion que la sécurité vient du client, et rendrait
impossible de vérifier la protection sans lire le front.

## Amendement du 05/09/2026 — le lien d'abord, et le rôle exige un hook

**Le rôle « lu dans le jeton » n'y était pas.** `useRole()` lisait
`app_metadata.roles`, et rien ne l'y écrivait : la migration `0001` crée
`user_roles`, pas un claim. Le badge admin ne pouvait donc jamais s'afficher,
et aucun test ne le couvrait. La décision tient — le rôle vient du jeton,
jamais d'une requête du front — mais elle demandait une pièce :
`0004_role_dans_le_jeton.sql` crée le hook « Custom Access Token » que GoTrue
appelle à chaque émission, et qui recopie `user_roles` dans le jeton. Le hook
doit être **activé** côté projet : `supabase/config.toml` pour la pile locale,
le tableau de bord (Authentication → Hooks) ou l'API de gestion
(`hook_custom_access_token_uri = pg-functions://postgres/public/custom_access_token_hook`)
pour le projet hébergé. Sans cette activation, le jeton reste muet et le badge
aussi — deux assertions pgTAP figent le comportement de la fonction, un test
unitaire celui du crochet, et le README liste le geste parmi ceux qu'une
application Supabase fait à la main.

**La connexion par lien devient l'entrée par défaut.** Les deux applications
de la famille qui ont écrit un écran de compte en septembre 2026 passent par
`signInWithOtp` ; `LoginForm mode="otp"` du socle ne rend qu'un champ, et le
mot de passe reste à un clic. Deux réglages sans lesquels le lien ne ramène
nulle part, et qui échouent en silence : `flowType: 'pkce'` sur le client —
une nécessité de **routage** dès qu'une application route par `#`, puisque
le flux implicite met le jeton dans le fragment, là où le routeur lit la
route ; posé ici bien que le squelette route par chemin, parce que ce fichier
part chez neuf applications qui routent par `#` — et la liste d'URL de retour
du projet Supabase, qui ne contient que `http://localhost:3000` à la création.

**Une nuance sur « filtrer par `user_id` dans le front ».** Elle reste vraie
ici : `notes` n'a qu'une politique de lecture. Le jour où une seconde
politique permissive apparaît (« les notes publiques »), les deux se combinent
par **OU**, et une lecture sans filtre rapporte aussi les notes des autres. Le
serveur a raison — une note publique est publique ; c'est la requête qui doit
dire ce qu'elle cherche, et une assertion pgTAP doit figer ce comportement
avant qu'un écran ne le découvre en production (mister-miss-koh, § 2 bis de
son `rls.test.sql`).
