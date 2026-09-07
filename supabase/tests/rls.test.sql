-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Comptes, profils et rôles d'application — pgTAP.                         ║
-- ║ Lancement : `supabase test db` (pile jetable), ou `pwa-pgtap` (base liée).║
-- ║                                                                          ║
-- ║ CE QUE CES TESTS PROUVENT, et qu'une relecture de politiques ne prouve   ║
-- ║ pas : `anon` ne voit rien, deux comptes sans espace commun ne se voient  ║
-- ║ pas, et personne ne peut s'attribuer un rôle d'application.              ║
-- ║                                                                          ║
-- ║ `set local role authenticated` + `request.jwt.claims` : c'est ainsi      ║
-- ║ qu'on se fait passer pour un utilisateur donné. Sans le rôle, la session ║
-- ║ garde `bypassrls` et TOUT passe — le test serait vert et faux.           ║
-- ║                                                                          ║
-- ║ UNE MISE À JOUR FILTRÉE PAR LA RLS NE LÈVE PAS : elle ne trouve rien.    ║
-- ║ Attendre une erreur là où la base se contente de ne rien toucher, c'est  ║
-- ║ écrire un test rouge sur une protection qui marche. On vérifie donc      ║
-- ║ l'ABSENCE d'effet, sous `postgres`, après coup.                          ║
-- ║                                                                          ║
-- ║ L'isolation entre ESPACES est éprouvée dans `espaces.test.sql`.          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

begin;
select plan(12);

-- ── Décor : deux comptes, et Bob administrateur de l'application ─────────

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'alice@exemple.test'),
  ('22222222-2222-2222-2222-222222222222', 'bob@exemple.test');

insert into user_roles (user_id, role)
values ('22222222-2222-2222-2222-222222222222', 'admin');

-- ── Le rôle arrive DANS le jeton, par le hook ─────────────────────────────

select is(
  (select custom_access_token_hook(
     '{"user_id":"22222222-2222-2222-2222-222222222222","claims":{"app_metadata":{"provider":"email"}}}'::jsonb
   ) -> 'claims' -> 'app_metadata' -> 'roles'),
  '["admin"]'::jsonb,
  'le hook recopie le rôle de Bob dans le jeton, sans écraser le reste d’app_metadata'
);

select is(
  (select custom_access_token_hook(
     '{"user_id":"11111111-1111-1111-1111-111111111111","claims":{}}'::jsonb
   ) -> 'claims' -> 'app_metadata' -> 'roles'),
  '[]'::jsonb,
  'sans rôle, un tableau vide — jamais une absence à interpréter'
);

select is(
  (select count(*)::int from profiles
   where id in ('11111111-1111-1111-1111-111111111111',
                '22222222-2222-2222-2222-222222222222')),
  2,
  'le profil naît avec le compte, sans requête du client'
);

-- ── `anon` ne voit rien ───────────────────────────────────────────────────

set local role anon;

select throws_ok(
  $$ select count(*) from profiles $$, '42501', null,
  'anon ne peut même pas lire la table des profils'
);
select throws_ok(
  $$ select count(*) from user_roles $$, '42501', null,
  'anon ne peut même pas lire la table des rôles'
);
select throws_ok(
  $$ select count(*) from expense_spaces $$, '42501', null,
  'anon ne peut même pas lire la table des espaces'
);

-- ── Alice ne voit qu'elle ─────────────────────────────────────────────────

reset role;
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is(
  (select count(*)::int from profiles),
  1,
  'un compte sans espace commun ne voit que son propre profil'
);

select throws_ok(
  $$ insert into user_roles (user_id, role)
     values ('11111111-1111-1111-1111-111111111111', 'admin') $$,
  '42501',
  null,
  's’attribuer un rôle est impossible depuis le navigateur'
);

select lives_ok(
  $$ update profiles set display_name = 'Bobby'
     where id = '22222222-2222-2222-2222-222222222222' $$,
  'modifier le profil d’un autre ne lève pas : la RLS ne lui montre aucune ligne'
);

reset role;
select isnt(
  (select display_name from profiles
    where id = '22222222-2222-2222-2222-222222222222'),
  'Bobby',
  '…et n’a rien touché'
);

-- ── Bob, administrateur de l'application, voit les profils ───────────────

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select is(
  (select count(*)::int from profiles),
  2,
  'un administrateur de l’application voit tous les profils'
);

select is(
  (select count(*)::int from user_roles),
  1,
  'et les rôles'
);

select * from finish();
rollback;
