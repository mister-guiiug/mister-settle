-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Supprimer son compte — pgTAP. Lancement : `supabase test db`.            ║
-- ║                                                                          ║
-- ║ CE QUE CE FICHIER PROUVE, et qui n'avait JAMAIS été prouvé sur ce parc : ║
-- ║ qu'une fonction `security definer` appartenant à `postgres` peut effacer ║
-- ║ une ligne d'`auth.users`, appelée par un utilisateur qui n'a lui-même    ║
-- ║ aucun droit sur cette table. AMELIORATIONS.md portait cette réserve      ║
-- ║ depuis le 05/09/2026 ; mister-doc s'appuyait dessus en production        ║
-- ║ (`delete_my_account`, `anonymize_doctor`) sans une seule assertion.      ║
-- ║                                                                          ║
-- ║ Il vérifie donc DEUX choses, et pas une :                                ║
-- ║                                                                          ║
-- ║  1. LE MÉCANISME — la fonction appartient bien à `postgres` et est bien  ║
-- ║     `security definer`, l'appelant NE PEUT PAS toucher `auth.users` par  ║
-- ║     lui-même, et le droit dont la fonction hérite est un GRANT, pas un   ║
-- ║     privilège de superutilisateur. Sans ces assertions, un test vert ne  ║
-- ║     dirait pas si l'effacement vient de la fonction ou de la session de  ║
-- ║     test, qui tourne sous `postgres` et pourrait tout faire.             ║
-- ║  2. LE RÉSULTAT — plus une ligne dans `profiles`, `notes`, `user_roles`  ║
-- ║     ni `auth.users`, et le compte du VOISIN intact.                      ║
-- ║                                                                          ║
-- ║ LE DÉCOR EST COMPTÉ AVANT. « Plus une ligne » est vrai d'une base vide : ║
-- ║ sans les quatre premières assertions, ce fichier serait vert le jour où  ║
-- ║ le décor cesserait de s'insérer.                                         ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

begin;
select plan(18);

-- ── Décor : deux comptes, et de quoi laisser des traces ──────────────────

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'alice@exemple.test'),
  ('22222222-2222-2222-2222-222222222222', 'bob@exemple.test');

-- Alice est administratrice : un rôle ne doit pas survivre à son titulaire.
insert into user_roles (user_id, role)
values ('11111111-1111-1111-1111-111111111111', 'admin');

insert into notes (id, user_id, text) values
  ('note_alice_1', '11111111-1111-1111-1111-111111111111', 'à Alice'),
  ('note_alice_2', '11111111-1111-1111-1111-111111111111', 'à Alice encore'),
  ('note_bob', '22222222-2222-2222-2222-222222222222', 'à Bob');

select is(
  (select count(*)::int from auth.users), 2,
  'décor : deux comptes existent avant l’effacement'
);
select is(
  (select count(*)::int from profiles), 2,
  'décor : les deux profils sont nés avec les comptes'
);
select is(
  (select count(*)::int from notes), 3,
  'décor : trois notes, dont deux à Alice'
);
select is(
  (select count(*)::int from user_roles), 1,
  'décor : Alice porte un rôle'
);

-- ── Le mécanisme : d'où vient le droit d'écrire dans auth.users ──────────

select is(
  (select pg_get_userbyid(proowner)::text
     from pg_proc where oid = 'public.delete_my_account()'::regprocedure),
  'postgres',
  'la fonction appartient à postgres — c’est de LUI qu’elle emprunte le droit d’écrire dans auth.users'
);

select ok(
  (select prosecdef
     from pg_proc where oid = 'public.delete_my_account()'::regprocedure),
  'elle est « security definer » : sans cela elle s’exécuterait avec les droits de l’appelant, qui n’en a aucun'
);

-- ── …ET CE DROIT N'EST PAS CELUI D'UN SUPERUTILISATEUR ───────────────────
--
-- C'est l'écart que ce fichier doit fermer, et la raison pour laquelle la
-- réserve d'AMELIORATIONS.md tenait depuis le 05/09/2026. La question n'a
-- jamais été « est-ce que ça marche ici » : c'est « est-ce que ça marchera
-- sur un projet HÉBERGÉ », où `postgres` n'est PAS superutilisateur. Voir la
-- fonction réussir sur une pile locale plus permissive ne prouverait rien si
-- elle réussissait par contournement.
--
-- Les deux assertions qui suivent nomment d'où vient le droit : `bypassrls`
-- pour les tables applicatives (que `postgres` porte des deux côtés), et un
-- GRANT explicite — ou la propriété de la table — pour `auth.users`. Ni l'un
-- ni l'autre n'est un privilège de superutilisateur : ce qui passe ici passe
-- donc en hébergé, et pour la même raison.

select ok(
  (select rolbypassrls from pg_roles where rolname = 'postgres'),
  'postgres porte bypassrls : la fonction traverse la RLS des tables applicatives — et c’est aussi pourquoi « force row level security » ne protégerait rien (cf. 0003)'
);

select ok(
  (select relowner = 'postgres'::regrole::oid
     from pg_class where oid = 'auth.users'::regclass)
  or exists (
    select 1
      from pg_class c, aclexplode(c.relacl) a
     where c.oid = 'auth.users'::regclass
       and a.grantee = 'postgres'::regrole::oid
       and a.privilege_type = 'DELETE'
  ),
  'le droit d’effacer dans auth.users est ACCORDÉ à postgres (grant explicite, ou propriété de la table) — ce n’est pas un privilège de superutilisateur, donc ce qui est prouvé ici vaut sur un projet hébergé'
);

-- ── `anon` ne l'atteint pas ──────────────────────────────────────────────
--
-- L'appel lèverait de toute façon (`auth.uid()` est nul), mais une fonction
-- qui efface des comptes n'a pas à être atteignable par la clé publique du
-- bundle. 42501 = le droit d'exécution a été retiré.

set local role anon;
select throws_ok(
  $$ select delete_my_account() $$, '42501', null,
  'anon ne peut même pas appeler la fonction'
);
reset role;

-- ── Alice, connectée ─────────────────────────────────────────────────────
--
-- `set local role authenticated` : sans lui, la session garde les droits de
-- `postgres`, et ce fichier prouverait que POSTGRES sait effacer un compte —
-- ce que personne ne conteste. Il serait vert et sans objet.

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

-- L'assertion qui donne son sens à toutes les autres : par elle-même, la
-- session d'Alice ne peut RIEN faire à `auth.users`.
select throws_ok(
  $$ delete from auth.users where id = '11111111-1111-1111-1111-111111111111' $$,
  '42501', null,
  'un compte connecté ne peut PAS toucher auth.users directement'
);

select lives_ok(
  $$ select delete_my_account() $$,
  'mais il peut effacer le sien par la fonction'
);

reset role;

-- ── Le résultat : plus une ligne ─────────────────────────────────────────

select is(
  (select count(*)::int from auth.users
   where id = '11111111-1111-1111-1111-111111111111'),
  0,
  'le compte lui-même a disparu d’auth.users — c’est la ligne qui distingue « vos données sont vidées » de « votre compte n’existe plus »'
);
select is(
  (select count(*)::int from profiles
   where id = '11111111-1111-1111-1111-111111111111'),
  0,
  'plus un profil'
);
select is(
  (select count(*)::int from notes
   where user_id = '11111111-1111-1111-1111-111111111111'),
  0,
  'plus une note'
);
select is(
  (select count(*)::int from user_roles
   where user_id = '11111111-1111-1111-1111-111111111111'),
  0,
  'plus un rôle : l’administration ne survit pas à son titulaire'
);

-- ── Et le voisin n'a rien senti ──────────────────────────────────────────
--
-- Une fonction qui efface « les données de l'utilisateur » et se trompe de
-- filtre est silencieuse : elle rend `void`, et le compte d'à côté est perdu.

select is(
  (select count(*)::int from auth.users), 1,
  'le compte de Bob est intact'
);
select is(
  (select count(*)::int from profiles
   where id = '22222222-2222-2222-2222-222222222222'),
  1,
  'son profil aussi'
);
select is(
  (select text from notes), 'à Bob',
  'et sa note est la seule qui reste'
);

select * from finish();
rollback;
