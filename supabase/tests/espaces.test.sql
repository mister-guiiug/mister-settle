-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Les espaces — isolation, rôles, invitations, rattachements. pgTAP.       ║
-- ║                                                                          ║
-- ║ LA SEULE ASSERTION QUI VAILLE sur une application multi-espaces : un     ║
-- ║ compte qui n'est pas membre ne voit RIEN de l'espace, et ne peut rien y  ║
-- ║ écrire — même en nommant les identifiants. Puis, rôle par rôle, ce que   ║
-- ║ chacun peut faire, et ce qu'il ne peut pas.                              ║
-- ║                                                                          ║
-- ║ Trois comptes : Alice crée l'espace (propriétaire), Bob est invité       ║
-- ║ contributeur puis rétrogradé lecteur, Carol n'a rien à voir avec tout    ║
-- ║ cela. Les vérifications d'état se font sous `postgres` (`reset role`),   ║
-- ║ qui traverse la RLS ; les gestes, sous le rôle de leur auteur.           ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

begin;
select plan(40);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'alice@exemple.test'),
  ('22222222-2222-2222-2222-222222222222', 'bob@exemple.test'),
  ('33333333-3333-3333-3333-333333333333', 'carol@exemple.test');

-- ── anon ne peut rien créer ───────────────────────────────────────────────

set local role anon;
select throws_ok(
  $$ select create_space('Bretagne', 'EUR') $$, '42501', null,
  'anon ne peut pas appeler create_space'
);
reset role;

-- ── Alice crée l'espace : trois lignes, une transaction ──────────────────

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select lives_ok(
  $$ select create_space('Bretagne', 'eur', 'Vacances', '🏖', '#3b6ea5', 'Alice',
                         'e0000000-0000-4000-8000-000000000001') $$,
  'Alice crée un espace par la fonction'
);

select is(
  (select role::text from space_memberships
    where space_id = 'e0000000-0000-4000-8000-000000000001'
      and user_id = '11111111-1111-1111-1111-111111111111'),
  'owner',
  'elle en est propriétaire'
);
select is(
  (select currency || '/' || minor_unit from expense_spaces
    where id = 'e0000000-0000-4000-8000-000000000001'),
  'EUR/2',
  'la devise est normalisée et ses décimales déduites'
);
select is(
  (select count(*)::int from participants
    where space_id = 'e0000000-0000-4000-8000-000000000001'),
  1,
  'la personne qu’est Alice existe déjà'
);
select is(
  (select count(*)::int from participant_user_links l
     join participants p on p.id = l.participant_id
    where p.space_id = 'e0000000-0000-4000-8000-000000000001'
      and l.user_id = '11111111-1111-1111-1111-111111111111'
      and l.unlinked_at is null),
  1,
  'et elle y est rattachée'
);

-- Alice, administratrice, ajoute deux personnes sans compte.
select lives_ok(
  $$ insert into participants (id, space_id, display_name, position, email) values
       ('a0000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000001', 'Bob', 1, 'bob@exemple.test'),
       ('a0000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-000000000001', 'Charlie', 2, null) $$,
  'l’administratrice ajoute des personnes sans compte'
);

-- ── Carol, qui n'est pas membre, ne voit rien et ne peut rien ────────────

set local request.jwt.claims to
  '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';

select is(
  (select count(*)::int from expense_spaces), 0,
  'un compte non membre ne voit pas l’espace'
);
select is(
  (select count(*)::int from participants), 0,
  'ni ses personnes'
);
select throws_ok(
  $$ insert into participants (space_id, display_name)
     values ('e0000000-0000-4000-8000-000000000001', 'Intrus') $$,
  '42501', null,
  'il ne peut pas y ajouter une personne, même en nommant l’espace'
);
select throws_ok(
  $$ select save_expense('{"space_id":"e0000000-0000-4000-8000-000000000001","label":"Intrusion","amount":"10.00","currency":"EUR","split_method":"equal","payers":[],"beneficiaries":[]}'::jsonb, null) $$,
  '42501', null,
  'ni y enregistrer une dépense'
);
select throws_ok(
  $$ select create_invitation('e0000000-0000-4000-8000-000000000001') $$,
  '42501', null,
  'ni y inviter qui que ce soit'
);
select throws_ok(
  $$ select transfer_space_ownership('e0000000-0000-4000-8000-000000000001',
                                     '33333333-3333-3333-3333-333333333333') $$,
  '42501', null,
  'ni s’en attribuer la propriété'
);

-- ── Alice invite Bob, en le désignant comme la personne « Bob » ──────────

set local request.jwt.claims to
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

-- Le jeton voyage par un réglage de session : `authenticated` n'a pas le
-- droit de créer une table, même temporaire.
select set_config('test.jeton',
  create_invitation('e0000000-0000-4000-8000-000000000001', 'contributor',
                    'a0000000-0000-4000-8000-000000000002',
                    interval '7 days', 1) ->> 'token',
  true);

select ok(
  length(current_setting('test.jeton')) = 48,
  'l’invitation rend un jeton, une fois'
);

reset role;
select is(
  (select count(*)::int from invitations where token_hash = current_setting('test.jeton')),
  0,
  'la base ne garde pas le jeton en clair'
);

-- ── Bob accepte : membre contributeur, rattaché à « Bob » ────────────────

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select lives_ok(
  $$ select accept_invitation(current_setting('test.jeton')) $$,
  'Bob accepte l’invitation'
);

reset role;
select is(
  (select role::text from space_memberships
    where space_id = 'e0000000-0000-4000-8000-000000000001'
      and user_id = '22222222-2222-2222-2222-222222222222'),
  'contributor',
  'il est membre, avec le rôle porté par l’invitation'
);
select is(
  (select user_id from participant_user_links
    where participant_id = 'a0000000-0000-4000-8000-000000000002' and unlinked_at is null),
  '22222222-2222-2222-2222-222222222222'::uuid,
  'et la personne « Bob » lui est rattachée — son historique n’a pas bougé'
);
select is(
  (select uses from invitations where space_id = 'e0000000-0000-4000-8000-000000000001'),
  1,
  'l’invitation compte un usage'
);

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
select throws_ok(
  $$ select accept_invitation(current_setting('test.jeton')) $$,
  'ST410', null,
  'un second usage est refusé : le lien est épuisé'
);

-- ── Bob, contributeur ────────────────────────────────────────────────────

set local request.jwt.claims to
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select is(
  (select count(*)::int from expense_spaces), 1,
  'un contributeur voit l’espace'
);
select is(
  (select count(*)::int from participants), 3,
  'et ses personnes'
);
select is(
  (select email from participants_public where id = 'a0000000-0000-4000-8000-000000000002'),
  null,
  'mais pas leur e-mail'
);
select throws_ok(
  $$ insert into participants (space_id, display_name)
     values ('e0000000-0000-4000-8000-000000000001', 'Dana') $$,
  '42501', null,
  'il ne gère pas les personnes'
);
select lives_ok(
  $$ insert into settlements (space_id, from_participant_id, to_participant_id, amount, currency, created_by)
     values ('e0000000-0000-4000-8000-000000000001',
             'a0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000003',
             '12.50', 'EUR', '22222222-2222-2222-2222-222222222222') $$,
  'il déclare un remboursement'
);
select throws_ok(
  $$ insert into settlements (space_id, from_participant_id, to_participant_id, amount, currency, created_by)
     values ('e0000000-0000-4000-8000-000000000001',
             'a0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000003',
             '12.50', 'EUR', '11111111-1111-1111-1111-111111111111') $$,
  '42501', null,
  'mais pas au nom d’un autre : l’auteur est vérifié'
);
select lives_ok(
  $ update space_memberships set role = 'admin'
     where space_id = 'e0000000-0000-4000-8000-000000000001'
       and user_id = '22222222-2222-2222-2222-222222222222' $,
  'se promouvoir ne lève pas…'
);
reset role;
select is(
  (select role::text from space_memberships
    where space_id = 'e0000000-0000-4000-8000-000000000001'
      and user_id = '22222222-2222-2222-2222-222222222222'),
  'contributor',
  '…et n’a rien fait : la RLS ne lui montre aucune adhésion à modifier'
);

-- ── Alice voit les e-mails, rétrograde Bob en lecteur ────────────────────

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is(
  (select email from participants_public where id = 'a0000000-0000-4000-8000-000000000002'),
  'bob@exemple.test',
  'une administratrice voit l’e-mail d’une personne'
);
select lives_ok(
  $$ update space_memberships set role = 'reader'
     where space_id = 'e0000000-0000-4000-8000-000000000001'
       and user_id = '22222222-2222-2222-2222-222222222222' $$,
  'elle rétrograde Bob en lecteur'
);
select throws_ok(
  $$ update space_memberships set role = 'reader'
     where space_id = 'e0000000-0000-4000-8000-000000000001'
       and user_id = '11111111-1111-1111-1111-111111111111' $$,
  '42501', null,
  'mais la propriété ne se modifie pas par une écriture directe'
);

-- ── Bob, lecteur ─────────────────────────────────────────────────────────

set local request.jwt.claims to
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select is(
  (select count(*)::int from participants), 3,
  'un lecteur lit toujours'
);
select throws_ok(
  $$ insert into settlements (space_id, from_participant_id, to_participant_id, amount, currency, created_by)
     values ('e0000000-0000-4000-8000-000000000001',
             'a0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000003',
             '1.00', 'EUR', '22222222-2222-2222-2222-222222222222') $$,
  '42501', null,
  'mais ne déclare plus rien'
);
select throws_ok(
  $$ select save_expense('{"space_id":"e0000000-0000-4000-8000-000000000001","label":"Café","amount":"2.00","currency":"EUR","split_method":"equal","payers":[],"beneficiaries":[]}'::jsonb, null) $$,
  '42501', null,
  'et n’enregistre aucune dépense'
);

-- ── Alice retire Bob : le rattachement tombe, la personne reste ──────────

set local request.jwt.claims to
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select lives_ok(
  $$ delete from space_memberships
     where space_id = 'e0000000-0000-4000-8000-000000000001'
       and user_id = '22222222-2222-2222-2222-222222222222' $$,
  'l’administratrice retire Bob de l’espace'
);

reset role;
select isnt(
  (select unlinked_at from participant_user_links
    where participant_id = 'a0000000-0000-4000-8000-000000000002'
    order by linked_at desc limit 1),
  null,
  'son rattachement est clos'
);
select is(
  (select display_name from participants where id = 'a0000000-0000-4000-8000-000000000002'),
  'Bob',
  'la personne « Bob » et son historique restent'
);

-- ── Le propriétaire archive, puis supprime ───────────────────────────────

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select lives_ok(
  $$ update expense_spaces set archived_at = now()
     where id = 'e0000000-0000-4000-8000-000000000001' $$,
  'le propriétaire archive l’espace'
);
select lives_ok(
  $$ delete from expense_spaces where id = 'e0000000-0000-4000-8000-000000000001' $$,
  'et peut le supprimer'
);

reset role;
select is(
  (select count(*)::int from participants
    where space_id = 'e0000000-0000-4000-8000-000000000001'),
  0,
  'la suppression emporte tout ce qui lui appartenait'
);

select * from finish();
rollback;
