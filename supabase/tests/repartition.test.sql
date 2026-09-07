-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ La répartition, côté serveur — pgTAP. Le JUMEAU de `split.test.ts`.      ║
-- ║                                                                          ║
-- ║ Mêmes cas, mêmes attendus : si `settle_split` et `split.ts` divergent un ║
-- ║ jour, c'est ici que ça se voit, pas dans un solde. Et ce que le serveur  ║
-- ║ refuse (somme fausse, version périmée, échelle au-delà de la devise),    ║
-- ║ il le refuse quoi que le client ait calculé de son côté.                 ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

begin;
select plan(26);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'alice@exemple.test');

-- Les montants alloués, dans l'ordre stable, sous la forme « 33.3400 33.3300 … ».
-- Créée sous `postgres` : `authenticated` ne crée rien dans `public`.
create or replace function test_allocations(p_expense uuid) returns text
language sql as $$
  select string_agg(a.amount::text, ' ' order by b.position, b.participant_id)
    from expense_allocations a
    join expense_beneficiaries b
      on b.expense_id = a.expense_id and b.participant_id = a.participant_id
   where a.expense_id = p_expense;
$$;

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select create_space('Colocation', 'EUR', '', '', '', 'Alice',
                    'e0000000-0000-4000-8000-000000000001');
select create_space('Ailleurs', 'EUR', '', '', '', 'Alice',
                    'e0000000-0000-4000-8000-000000000002');

-- Trois personnes, dans un ordre stable (positions 10, 20, 30), et une
-- personne d'un AUTRE espace, pour la garde.
insert into participants (id, space_id, display_name, position) values
  ('a0000000-0000-4000-8000-000000000011', 'e0000000-0000-4000-8000-000000000001', 'Anne', 10),
  ('a0000000-0000-4000-8000-000000000012', 'e0000000-0000-4000-8000-000000000001', 'Ben', 20),
  ('a0000000-0000-4000-8000-000000000013', 'e0000000-0000-4000-8000-000000000001', 'Cléo', 30),
  ('a0000000-0000-4000-8000-000000000099', 'e0000000-0000-4000-8000-000000000002', 'Étranger', 1);

-- ── 1. Équitable : 100 € à trois, le centime en trop au premier ──────────

select lives_ok(
  $$ select save_expense('{
       "id":"d0000000-0000-4000-8000-000000000001",
       "space_id":"e0000000-0000-4000-8000-000000000001",
       "label":"Restaurant","amount":"100.00","currency":"EUR","split_method":"equal",
       "payers":[{"participant_id":"a0000000-0000-4000-8000-000000000011","amount":"100.00"}],
       "beneficiaries":[
         {"participant_id":"a0000000-0000-4000-8000-000000000013","position":30},
         {"participant_id":"a0000000-0000-4000-8000-000000000011","position":10},
         {"participant_id":"a0000000-0000-4000-8000-000000000012","position":20}]
     }'::jsonb, null) $$,
  'une dépense s’enregistre en brouillon'
);
select is(
  (select status::text || '/' || version from expenses where id = 'd0000000-0000-4000-8000-000000000001'),
  'draft/1',
  'brouillon, version 1, sans allocation'
);
select lives_ok(
  $$ select validate_expense('d0000000-0000-4000-8000-000000000001', 1) $$,
  'la validation recalcule côté serveur'
);
select is(
  test_allocations('d0000000-0000-4000-8000-000000000001'),
  '33.3400 33.3300 33.3300',
  'équitable : 33,34 · 33,33 · 33,33 — le centime au premier de l’ordre stable, pas de la saisie'
);
select is(
  (select status::text || '/' || version from expenses where id = 'd0000000-0000-4000-8000-000000000001'),
  'validated/2',
  'validée, version 2'
);
select is(
  (select count(*)::int from expense_revisions where expense_id = 'd0000000-0000-4000-8000-000000000001'),
  2,
  'deux révisions : l’enregistrement et la validation'
);

-- ── 2. Par parts : 120 € en 2 · 1 · 1 ────────────────────────────────────

select save_expense('{
  "id":"d0000000-0000-4000-8000-000000000002",
  "space_id":"e0000000-0000-4000-8000-000000000001",
  "label":"Courses","amount":"120.00","currency":"EUR","split_method":"shares",
  "payers":[{"participant_id":"a0000000-0000-4000-8000-000000000011","amount":"120.00"}],
  "beneficiaries":[
    {"participant_id":"a0000000-0000-4000-8000-000000000011","position":10,"shares":"2"},
    {"participant_id":"a0000000-0000-4000-8000-000000000012","position":20,"shares":"1"},
    {"participant_id":"a0000000-0000-4000-8000-000000000013","position":30,"shares":"1"}]
}'::jsonb, null);
select validate_expense('d0000000-0000-4000-8000-000000000002', 1);
select is(
  test_allocations('d0000000-0000-4000-8000-000000000002'),
  '60.0000 30.0000 30.0000',
  'parts 2 · 1 · 1 de 120 € : 60 · 30 · 30'
);

-- ── 3. Parts décimales : 10 € en 1,5 contre 1 ────────────────────────────

select save_expense('{
  "id":"d0000000-0000-4000-8000-000000000003",
  "space_id":"e0000000-0000-4000-8000-000000000001",
  "label":"Pain","amount":"10.00","currency":"EUR","split_method":"shares",
  "payers":[{"participant_id":"a0000000-0000-4000-8000-000000000011","amount":"10.00"}],
  "beneficiaries":[
    {"participant_id":"a0000000-0000-4000-8000-000000000011","position":10,"shares":"1.5"},
    {"participant_id":"a0000000-0000-4000-8000-000000000012","position":20,"shares":"1"}]
}'::jsonb, null);
select validate_expense('d0000000-0000-4000-8000-000000000003', 1);
select is(
  test_allocations('d0000000-0000-4000-8000-000000000003'),
  '6.0000 4.0000',
  'parts 1,5 contre 1 de 10 € : 6 et 4, sans flottant'
);

-- ── 4. Plus forts restes : 1 € en 1,3 · 1,3 · 1,4 ────────────────────────

select save_expense('{
  "id":"d0000000-0000-4000-8000-000000000004",
  "space_id":"e0000000-0000-4000-8000-000000000001",
  "label":"Chewing-gum","amount":"1.00","currency":"EUR","split_method":"shares",
  "payers":[{"participant_id":"a0000000-0000-4000-8000-000000000011","amount":"1.00"}],
  "beneficiaries":[
    {"participant_id":"a0000000-0000-4000-8000-000000000011","position":10,"shares":"1.3"},
    {"participant_id":"a0000000-0000-4000-8000-000000000012","position":20,"shares":"1.3"},
    {"participant_id":"a0000000-0000-4000-8000-000000000013","position":30,"shares":"1.4"}]
}'::jsonb, null);
select validate_expense('d0000000-0000-4000-8000-000000000004', 1);
select is(
  test_allocations('d0000000-0000-4000-8000-000000000004'),
  '0.3300 0.3200 0.3500',
  'plus forts restes : 33 · 32 · 35 centimes, somme 100 — comme split.test.ts'
);

-- ── 5. Par montant : la somme fausse est refusée ─────────────────────────

select save_expense('{
  "id":"d0000000-0000-4000-8000-000000000005",
  "space_id":"e0000000-0000-4000-8000-000000000001",
  "label":"Essence","amount":"90.00","currency":"EUR","split_method":"amount",
  "payers":[{"participant_id":"a0000000-0000-4000-8000-000000000011","amount":"90.00"}],
  "beneficiaries":[
    {"participant_id":"a0000000-0000-4000-8000-000000000011","position":10,"amount_input":"40.00"},
    {"participant_id":"a0000000-0000-4000-8000-000000000012","position":20,"amount_input":"30.00"},
    {"participant_id":"a0000000-0000-4000-8000-000000000013","position":30,"amount_input":"10.00"}]
}'::jsonb, null);
select throws_ok(
  $$ select validate_expense('d0000000-0000-4000-8000-000000000005', 1) $$,
  'ST422', 'amounts-sum-mismatch',
  'par montant : 40 + 30 + 10 ≠ 90, la validation est refusée'
);

-- ── 6. Plusieurs payeurs dont la somme est fausse ────────────────────────

select save_expense('{
  "id":"d0000000-0000-4000-8000-000000000006",
  "space_id":"e0000000-0000-4000-8000-000000000001",
  "label":"Péage","amount":"90.00","currency":"EUR","split_method":"equal",
  "payers":[{"participant_id":"a0000000-0000-4000-8000-000000000011","amount":"50.00"},
            {"participant_id":"a0000000-0000-4000-8000-000000000012","amount":"30.00"}],
  "beneficiaries":[
    {"participant_id":"a0000000-0000-4000-8000-000000000011","position":10},
    {"participant_id":"a0000000-0000-4000-8000-000000000012","position":20}]
}'::jsonb, null);
select throws_ok(
  $$ select validate_expense('d0000000-0000-4000-8000-000000000006', 1) $$,
  'ST422', 'payers-sum-mismatch',
  'plusieurs payeurs : 50 + 30 ≠ 90, la validation est refusée'
);

-- ── 7. Version périmée ───────────────────────────────────────────────────

select throws_ok(
  $$ select validate_expense('d0000000-0000-4000-8000-000000000001', 1) $$,
  'ST409', null,
  'valider avec une version périmée est un conflit explicite'
);

-- ── 8. Une modification hors calcul garde la validation ──────────────────

select save_expense('{
  "id":"d0000000-0000-4000-8000-000000000001",
  "space_id":"e0000000-0000-4000-8000-000000000001",
  "label":"Restaurant du port","amount":"100.00","currency":"EUR","split_method":"equal",
  "note":"anniversaire",
  "payers":[{"participant_id":"a0000000-0000-4000-8000-000000000011","amount":"100.00"}],
  "beneficiaries":[
    {"participant_id":"a0000000-0000-4000-8000-000000000011","position":10},
    {"participant_id":"a0000000-0000-4000-8000-000000000012","position":20},
    {"participant_id":"a0000000-0000-4000-8000-000000000013","position":30}]
}'::jsonb, 2);
select is(
  (select status::text || '/' || version from expenses where id = 'd0000000-0000-4000-8000-000000000001'),
  'validated/3',
  'renommer et annoter ne fait pas tomber la validation'
);
select is(
  (select count(*)::int from expense_allocations where expense_id = 'd0000000-0000-4000-8000-000000000001'),
  3,
  'et garde les allocations'
);

-- ── 9. Une modification du calcul la fait tomber ─────────────────────────

select save_expense('{
  "id":"d0000000-0000-4000-8000-000000000001",
  "space_id":"e0000000-0000-4000-8000-000000000001",
  "label":"Restaurant du port","amount":"90.00","currency":"EUR","split_method":"equal",
  "payers":[{"participant_id":"a0000000-0000-4000-8000-000000000011","amount":"90.00"}],
  "beneficiaries":[
    {"participant_id":"a0000000-0000-4000-8000-000000000011","position":10},
    {"participant_id":"a0000000-0000-4000-8000-000000000012","position":20},
    {"participant_id":"a0000000-0000-4000-8000-000000000013","position":30}]
}'::jsonb, 3);
select is(
  (select status::text from expenses where id = 'd0000000-0000-4000-8000-000000000001'),
  'draft',
  'changer le montant remet la dépense en brouillon'
);
select is(
  (select count(*)::int from expense_allocations where expense_id = 'd0000000-0000-4000-8000-000000000001'),
  0,
  'et retire les allocations, qui ne correspondent plus à rien'
);
select is(
  (select validated_at from expenses where id = 'd0000000-0000-4000-8000-000000000001'),
  null,
  'la date de validation est effacée'
);

-- ── 10. La composition d'un regroupement est figée ───────────────────────

insert into participant_groups (id, space_id, name)
values ('c0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'Famille');
insert into participant_group_members (group_id, participant_id) values
  ('c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000011'),
  ('c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000012');

select save_expense('{
  "id":"d0000000-0000-4000-8000-000000000007",
  "space_id":"e0000000-0000-4000-8000-000000000001",
  "label":"Cinéma","amount":"50.00","currency":"EUR","split_method":"equal",
  "selected_group_ids":["c0000000-0000-4000-8000-000000000001"],
  "payers":[{"participant_id":"a0000000-0000-4000-8000-000000000011","amount":"50.00"}],
  "beneficiaries":[
    {"participant_id":"a0000000-0000-4000-8000-000000000011","position":10,"via_group_id":"c0000000-0000-4000-8000-000000000001"},
    {"participant_id":"a0000000-0000-4000-8000-000000000012","position":20,"via_group_id":"c0000000-0000-4000-8000-000000000001"}]
}'::jsonb, null);
select validate_expense('d0000000-0000-4000-8000-000000000007', 1);
select is(
  (select array_length(member_participant_ids, 1) from expense_group_snapshots
    where expense_id = 'd0000000-0000-4000-8000-000000000007'),
  2,
  'la dépense fige la composition du regroupement : deux membres'
);

delete from participant_group_members
 where group_id = 'c0000000-0000-4000-8000-000000000001'
   and participant_id = 'a0000000-0000-4000-8000-000000000012';
select is(
  (select array_length(member_participant_ids, 1) from expense_group_snapshots
    where expense_id = 'd0000000-0000-4000-8000-000000000007'),
  2,
  'retirer un membre du regroupement ne réécrit pas la dépense validée'
);
select is(
  (select count(*)::int from expense_allocations where expense_id = 'd0000000-0000-4000-8000-000000000007'),
  2,
  'ses allocations restent celles des deux personnes'
);

-- ── 11. Les soldes, calculés, à somme nulle ──────────────────────────────
--
-- Validées : 120 € (parts 2·1·1), 10 € (1,5·1), 1 € (1,3·1,3·1,4), 50 € (la
-- famille). Anne a tout payé : 60 + 4 + 0,67 + 25 = 89,67 ; Ben doit
-- 30 + 4 + 0,32 + 25 = 59,32 ; Cléo 30 + 0,35 = 30,35.

select is(
  (select net::text from space_balances
    where participant_id = 'a0000000-0000-4000-8000-000000000011'),
  '89.6700',
  'solde d’Anne : ce qu’elle a payé moins ce qu’elle doit'
);
select is(
  (select sum(net)::text from space_balances
    where space_id = 'e0000000-0000-4000-8000-000000000001'),
  '0.0000',
  'la somme des soldes de l’espace est nulle'
);

insert into settlements (space_id, from_participant_id, to_participant_id, amount, currency, created_by)
values ('e0000000-0000-4000-8000-000000000001',
        'a0000000-0000-4000-8000-000000000012', 'a0000000-0000-4000-8000-000000000011',
        '59.32', 'EUR', '11111111-1111-1111-1111-111111111111');
select is(
  (select net::text from space_balances
    where participant_id = 'a0000000-0000-4000-8000-000000000012'),
  '0.0000',
  'un remboursement déclaré solde Ben'
);

-- ── 12. Ce que le serveur refuse avant tout calcul ───────────────────────

select throws_ok(
  $$ select save_expense('{
       "space_id":"e0000000-0000-4000-8000-000000000001",
       "label":"Trop précis","amount":"12.345","currency":"EUR","split_method":"equal",
       "payers":[],"beneficiaries":[]}'::jsonb, null) $$,
  'ST422', null,
  'un montant à plus de décimales que la devise est refusé, jamais arrondi'
);
select throws_ok(
  $$ select save_expense('{
       "space_id":"e0000000-0000-4000-8000-000000000001",
       "label":"Intrus","amount":"10.00","currency":"EUR","split_method":"equal",
       "payers":[{"participant_id":"a0000000-0000-4000-8000-000000000099","amount":"10.00"}],
       "beneficiaries":[{"participant_id":"a0000000-0000-4000-8000-000000000011","position":10}]}'::jsonb, null) $$,
  '23514', null,
  'une personne d’un autre espace ne peut pas payer ici'
);
select throws_ok(
  $$ select save_expense('{
       "id":"d0000000-0000-4000-8000-000000000002",
       "space_id":"e0000000-0000-4000-8000-000000000001",
       "label":"Courses","amount":"120.00","currency":"EUR","split_method":"shares",
       "payers":[{"participant_id":"a0000000-0000-4000-8000-000000000011","amount":"120.00"}],
       "beneficiaries":[{"participant_id":"a0000000-0000-4000-8000-000000000011","position":10,"shares":"1"}]}'::jsonb, 1) $$,
  'ST409', null,
  'enregistrer par-dessus une version périmée est un conflit'
);

select * from finish();
rollback;
