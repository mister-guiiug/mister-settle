-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Supprimer son compte quand on a des espaces — le cas du propriétaire.    ║
-- ║                                                                          ║
-- ║ Alice possède deux espaces : l'un avec Bob (administrateur, invité par   ║
-- ║ elle), l'autre seule. Dans le premier elle a noté une dépense et déclaré ║
-- ║ un remboursement. Elle supprime son compte : le premier passe à Bob, sa  ║
-- ║ personne y reste (délestée du compte), sa dépense et son remboursement   ║
-- ║ aussi, sans auteur ; le journal ne la nomme plus mais note son départ,   ║
-- ║ sans raconter chaque colonne d'auteur passée à null ; le second espace   ║
-- ║ disparaît. Les vérifications d'état se font sous `postgres`.             ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

begin;
select plan(18);

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

-- La personne « Alice » du premier espace, née avec lui, sans identifiant
-- choisi : on le retient pour la suite.
select set_config('test.alice',
  (select id::text from participants
    where space_id = 'e0000000-0000-4000-8000-000000000001'
      and display_name = 'Alice'), true);

select lives_ok(
  $$ insert into participants (id, space_id, display_name, created_by)
     values ('a0000000-0000-4000-8000-000000000002',
             'e0000000-0000-4000-8000-000000000001', 'Bob',
             '11111111-1111-1111-1111-111111111111') $$,
  'elle ajoute la personne Bob'
);
select lives_ok(
  $$ select set_config('test.jeton', (create_invitation(
       'e0000000-0000-4000-8000-000000000001', 'admin',
       'a0000000-0000-4000-8000-000000000002') ->> 'token'), true) $$,
  'et l’invite comme administrateur, rattaché à cette personne'
);

set local request.jwt.claims to
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select lives_ok(
  $$ select accept_invitation(current_setting('test.jeton', true)) $$,
  'Bob l’accepte'
);

-- ── Alice note une dépense, déclare un remboursement ─────────────────────

set local request.jwt.claims to
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select lives_ok(
  $$ select save_expense(jsonb_build_object(
       'id', 'd0000000-0000-4000-8000-000000000001',
       'space_id', 'e0000000-0000-4000-8000-000000000001',
       'label', 'Restaurant', 'amount', '30.00', 'currency', 'EUR',
       'split_method', 'equal',
       'payers', jsonb_build_array(jsonb_build_object(
         'participant_id', current_setting('test.alice', true), 'amount', '30.00')),
       'beneficiaries', jsonb_build_array(
         jsonb_build_object('participant_id', current_setting('test.alice', true), 'position', 10),
         jsonb_build_object('participant_id', 'a0000000-0000-4000-8000-000000000002', 'position', 20))
     ), null) $$,
  'elle note une dépense'
);
select lives_ok(
  $$ insert into settlements (space_id, from_participant_id, to_participant_id, amount, currency, created_by)
     values ('e0000000-0000-4000-8000-000000000001',
             'a0000000-0000-4000-8000-000000000002', current_setting('test.alice', true)::uuid,
             '12.50', 'EUR', '11111111-1111-1111-1111-111111111111') $$,
  'et déclare un remboursement de Bob'
);

-- ── Alice supprime son compte ─────────────────────────────────────────────

select lives_ok(
  $$ select delete_my_account() $$,
  'Alice supprime son compte, propriétaire de deux espaces'
);

reset role;

-- L'espace partagé : transmis, et tout y reste — sans elle.
select is(
  (select role::text from space_memberships
    where space_id = 'e0000000-0000-4000-8000-000000000001'
      and user_id = '22222222-2222-2222-2222-222222222222'),
  'owner',
  'l’espace partagé passe à Bob'
);
select is(
  (select invited_by from space_memberships
    where space_id = 'e0000000-0000-4000-8000-000000000001'
      and user_id = '22222222-2222-2222-2222-222222222222'),
  null::uuid,
  'son invitation ne nomme plus personne'
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
  (select count(*)::int from expenses
    where space_id = 'e0000000-0000-4000-8000-000000000001'
      and created_by is null),
  1,
  'sa dépense reste, sans auteur'
);
select is(
  (select count(*)::int from settlements
    where space_id = 'e0000000-0000-4000-8000-000000000001'
      and created_by is null),
  1,
  'son remboursement aussi'
);

-- Le journal : plus son nom, mais son départ ; et pas une ligne par colonne
-- d'auteur passée à null.
select is(
  (select count(*)::int from activity_logs
    where actor_user_id = '11111111-1111-1111-1111-111111111111'),
  0,
  'le journal ne la nomme plus'
);
select is(
  (select count(*)::int from activity_logs
    where space_id = 'e0000000-0000-4000-8000-000000000001'
      and entity = 'space_memberships' and action = 'delete'),
  1,
  'mais note son départ'
);
select is(
  (select count(*)::int from activity_logs
    where space_id = 'e0000000-0000-4000-8000-000000000001'
      and action = 'update'
      and entity in ('participants', 'settlements')),
  0,
  'sans raconter ses colonnes d’auteur passées à null'
);

-- L'espace où elle était seule n'a plus personne pour le tenir.
select is(
  (select count(*)::int from expense_spaces
    where id = 'e0000000-0000-4000-8000-000000000002'),
  0,
  'l’espace où elle était seule disparaît'
);

select * from finish();
rollback;
