-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Les fonctions internes de la répartition, fermées au dehors (0014).      ║
-- ║                                                                          ║
-- ║ `settle_split`, `settle_fingerprint` et `settle_expense_snapshot` ne     ║
-- ║ vérifient pas l'appartenance à l'espace : c'est le travail de leurs      ║
-- ║ appelants, `save_expense` et `validate_expense`. Rendues à              ║
-- ║ `authenticated` par 0009, elles laissaient tout compte connecté lire une ║
-- ║ dépense d'un espace qui n'est pas le sien. Ce fichier garde la porte     ║
-- ║ fermée ; `repartition.test.sql` garde, lui, le chemin légitime, qui      ║
-- ║ passe par `save_expense` et doit continuer de répartir.                  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

begin;
select plan(8);

-- Rend le SQLSTATE d'une instruction, ou « aucune erreur ». Créée sous
-- `postgres`, exécutée sous le rôle courant (SECURITY INVOKER).
create or replace function test_try(p_sql text) returns text language plpgsql as $fn$
begin
  execute p_sql;
  return 'aucune erreur';
exception
  when others then return sqlstate;
end
$fn$;
grant execute on function test_try(text) to authenticated;

select ok(
  not has_function_privilege('authenticated', 'settle_split(uuid)', 'execute'),
  'settle_split : plus exécutable par un compte connecté'
);
select ok(
  not has_function_privilege('authenticated', 'settle_fingerprint(uuid)', 'execute'),
  'settle_fingerprint : idem'
);
select ok(
  not has_function_privilege('authenticated', 'settle_expense_snapshot(uuid)', 'execute'),
  'settle_expense_snapshot : idem'
);
select ok(
  not has_function_privilege('anon', 'settle_expense_snapshot(uuid)', 'execute'),
  'et toujours pas par anon'
);
select ok(
  has_function_privilege('postgres', 'settle_expense_snapshot(uuid)', 'execute'),
  'postgres, sous qui save_expense et validate_expense s''exécutent, garde son droit'
);
select ok(
  has_function_privilege('authenticated', 'save_expense(jsonb, integer)', 'execute'),
  'le chemin légitime, save_expense, reste ouvert aux comptes connectés'
);
select ok(
  has_function_privilege('authenticated', 'settle_minor(numeric, integer)', 'execute'),
  'settle_minor, pur calcul sans lecture, reste ouverte'
);

-- L'appel réel, comme le ferait PostgREST pour un compte connecté.
insert into auth.users (id, email) values
  ('71111111-1111-1111-1111-111111111111', 'curieux@exemple.test');
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"71111111-1111-1111-1111-111111111111","role":"authenticated"}';
select set_config('test.res', test_try(
  $$ select settle_expense_snapshot('00000000-0000-4000-8000-000000000000') $$
), true);
reset role;

select is(current_setting('test.res'), '42501',
  'un compte connecté qui appelle settle_expense_snapshot est refusé');

select * from finish();
rollback;
