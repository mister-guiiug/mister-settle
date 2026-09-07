-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Supprimer son compte quand on a des espaces — le cas du propriétaire.    ║
-- ║                                                                          ║
-- ║ Alice possède deux espaces : l'un avec Bob (administrateur), l'autre     ║
-- ║ seule. Elle supprime son compte : le premier passe à Bob, sa personne y  ║
-- ║ reste (délestée du compte), sa dépense aussi ; le second disparaît.      ║
-- ║ Les vérifications d'état se font sous `postgres` (`reset role`).         ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

begin;
select plan(9);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'alice@exemple.test'),
  ('22222222-2222-2222-2222-222222222222', 'bob@exemple.test');

-- ── Alice crée deux espaces, invite Bob dans le premier ──────────────────

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select lives_ok(
  $$ select create_space('Partagé', 'EUR', '', '', '', 'Alice',
                         'e0000000-0000-4000-8000-000000000001') $$,
  'Alice crée un espace partagé'
);
select lives_ok(
  $$ select create_space('Seule', 'EUR', '', '', '', 'Alice',
                         'e0000000-0000-4000-8000-000000000002') $$,
  'et un espace où elle est seule'
);
select lives_ok(
  $$ select set_config('test.jeton', (create_invitation(
       'e0000000-0000-4000-8000-000000000001', 'admin') ->> 'token'), true) $$,
  'elle émet une invitation d’administrateur'
);

set local request.jwt.claims to
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select lives_ok(
  $$ select accept_invitation(current_setting('test.jeton', true)) $$,
  'Bob l’accepte'
);

-- ── Alice supprime son compte ─────────────────────────────────────────────

set local request.jwt.claims to
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select lives_ok(
  $$ select delete_my_account() $$,
  'Alice supprime son compte, propriétaire de deux espaces'
);

reset role;

select is(
  (select role::text from space_memberships
    where space_id = 'e0000000-0000-4000-8000-000000000001'
      and user_id = '22222222-2222-2222-2222-222222222222'),
  'owner',
  'l’espace partagé passe à Bob'
);
select is(
  (select count(*)::int from participants
    where space_id = 'e0000000-0000-4000-8000-000000000001'
      and display_name = 'Alice'),
  1,
  'la personne Alice y reste'
);
select is(
  (select count(*)::int from participant_user_links l
     join participants p on p.id = l.participant_id
    where p.space_id = 'e0000000-0000-4000-8000-000000000001'
      and l.user_id = '11111111-1111-1111-1111-111111111111'),
  0,
  'délestée de son compte'
);
select is(
  (select count(*)::int from expense_spaces
    where id = 'e0000000-0000-4000-8000-000000000002'),
  0,
  'l’espace où elle était seule disparaît'
);

select * from finish();
rollback;
