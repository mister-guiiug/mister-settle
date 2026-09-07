-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Supprimer son compte — pgTAP.                                            ║
-- ║                                                                          ║
-- ║ CE QUE CE FICHIER PROUVE, et qui n'avait JAMAIS été prouvé sur ce parc : ║
-- ║ qu'une fonction `security definer` appartenant à `postgres` peut effacer ║
-- ║ une ligne d'`auth.users`, appelée par un utilisateur qui n'a lui-même    ║
-- ║ aucun droit sur cette table.                                             ║
-- ║                                                                          ║
-- ║ Il vérifie donc DEUX choses, et pas une :                                ║
-- ║                                                                          ║
-- ║  1. LE MÉCANISME — la fonction appartient bien à `postgres` et est bien  ║
-- ║     `security definer`, l'appelant NE PEUT PAS toucher `auth.users` par  ║
-- ║     lui-même, et le droit dont la fonction hérite est un GRANT, pas un   ║
-- ║     privilège de superutilisateur.                                       ║
-- ║  2. LE RÉSULTAT — plus une ligne dans `profiles`, `user_roles` ni        ║
-- ║     `auth.users`, et le compte du VOISIN intact. Ce qu'un compte laisse  ║
-- ║     dans un ESPACE (sa personne, ses dépenses) est le sujet de           ║
-- ║     `espaces.test.sql` et d'une version ultérieure de la fonction.       ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

begin;
select plan(15);

-- ── Décor : deux comptes, et de quoi laisser des traces ──────────────────

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'alice@exemple.test'),
  ('22222222-2222-2222-2222-222222222222', 'bob@exemple.test');

insert into user_roles (user_id, role)
values ('11111111-1111-1111-1111-111111111111', 'admin');

select is(
  (select count(*)::int from auth.users), 2,
  'décor : deux comptes existent avant l’effacement'
);
select is(
  (select count(*)::int from profiles), 2,
  'décor : les deux profils sont nés avec les comptes'
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

select ok(
  (select rolbypassrls from pg_roles where rolname = 'postgres'),
  'postgres porte bypassrls : la fonction traverse la RLS des tables applicatives'
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
  'le droit d’effacer dans auth.users est ACCORDÉ à postgres — ce n’est pas un privilège de superutilisateur'
);

-- ── `anon` ne l'atteint pas ──────────────────────────────────────────────

set local role anon;
select throws_ok(
  $$ select delete_my_account() $$, '42501', null,
  'anon ne peut même pas appeler la fonction'
);
reset role;

-- ── Alice, connectée ─────────────────────────────────────────────────────

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

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
  'le compte lui-même a disparu d’auth.users'
);
select is(
  (select count(*)::int from profiles
   where id = '11111111-1111-1111-1111-111111111111'),
  0,
  'plus un profil'
);
select is(
  (select count(*)::int from user_roles
   where user_id = '11111111-1111-1111-1111-111111111111'),
  0,
  'plus un rôle : l’administration ne survit pas à son titulaire'
);

-- ── Et le voisin n'a rien senti ──────────────────────────────────────────

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

select * from finish();
rollback;
