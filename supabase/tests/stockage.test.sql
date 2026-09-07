-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Le stockage des justificatifs — bucket privé, politiques par préfixe.    ║
-- ║                                                                          ║
-- ║ Le bucket existe et n'est pas public ; l'espace se lit dans le chemin ;  ║
-- ║ un membre dépose sous le préfixe de SON espace et pas d'un autre ; une   ║
-- ║ personne étrangère à l'espace ne voit rien et ne dépose rien.            ║
-- ║                                                                          ║
-- ║ LE SCHÉMA `storage` APPARTIENT AU SERVICE DE STOCKAGE. Sur la pile       ║
-- ║ jetable il existe sans ses tables, et `postgres` n'y a pas le droit      ║
-- ║ d'écrire : les assertions qui en dépendent sont alors SAUTÉES, et le     ║
-- ║ disent. Là où les tables existent (projet réel, ou double posé quand on  ║
-- ║ en a le droit), elles se jouent — par la même fonction d'installation    ║
-- ║ que la migration.                                                        ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

begin;

do $$
begin
  if to_regclass('storage.objects') is not null then
    perform set_config('test.storage', 'on', true);
    return;
  end if;
  begin
    create schema if not exists storage;
    create table if not exists storage.buckets (
      id text primary key,
      name text not null,
      public boolean not null default false,
      file_size_limit bigint,
      allowed_mime_types text[],
      created_at timestamptz not null default now()
    );
    create table if not exists storage.objects (
      id uuid primary key default gen_random_uuid(),
      bucket_id text references storage.buckets (id),
      name text,
      owner uuid,
      metadata jsonb,
      created_at timestamptz not null default now()
    );
    alter table storage.objects enable row level security;
    grant usage on schema storage to anon, authenticated;
    grant all on storage.buckets, storage.objects to anon, authenticated;
    perform set_config('test.storage', 'on', true);
  exception when insufficient_privilege then
    perform set_config('test.storage', 'off', true);
  end;
end;
$$;

do $$
begin
  if current_setting('test.storage', true) = 'on' then
    begin
      perform settle_install_receipts();
    exception when insufficient_privilege then
      perform set_config('test.storage', 'off', true);
    end;
  end if;
end;
$$;

select plan(10);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'alice@exemple.test'),
  ('33333333-3333-3333-3333-333333333333', 'carol@exemple.test');

-- ── Ce qui se vérifie partout ─────────────────────────────────────────────

select is(
  settle_path_space('pas-un-uuid/x.jpg'),
  null,
  'un chemin sans espace ne donne rien'
);
select is(
  settle_path_space('e0000000-0000-4000-8000-000000000001/x/a.jpg'),
  'e0000000-0000-4000-8000-000000000001'::uuid,
  'l’espace se lit dans le préfixe du chemin'
);
select has_function(
  'public', 'settle_install_receipts', array[]::text[],
  'l’installation du bucket et des politiques est une fonction, idempotente'
);

-- ── Ce qui demande les tables du stockage ─────────────────────────────────

select case when current_setting('test.storage', true) = 'on'
  then results_eq(
    $$ select public from storage.buckets where id = 'receipts' $$,
    $$ values (false) $$,
    'le bucket receipts existe, et il est privé')
  else skip('pas de tables storage accessibles sur cette pile') end;

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select lives_ok(
  $$ select create_space('Bretagne', 'EUR', '', '', '', 'Alice',
                         'e0000000-0000-4000-8000-000000000001') $$,
  'Alice crée un espace'
);
select case when current_setting('test.storage', true) = 'on'
  then lives_ok(
    $$ insert into storage.objects (bucket_id, name, owner)
       values ('receipts', 'e0000000-0000-4000-8000-000000000001/x/a.jpg', auth.uid()) $$,
    'un membre dépose un objet sous le préfixe de son espace')
  else skip('pas de tables storage accessibles sur cette pile') end;
select case when current_setting('test.storage', true) = 'on'
  then throws_ok(
    $$ insert into storage.objects (bucket_id, name, owner)
       values ('receipts', 'f0000000-0000-4000-8000-000000000009/x/b.jpg', auth.uid()) $$,
    '42501', null,
    'mais pas sous le préfixe d’un espace étranger')
  else skip('pas de tables storage accessibles sur cette pile') end;

set local request.jwt.claims to
  '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';

select case when current_setting('test.storage', true) = 'on'
  then results_eq(
    $$ select count(*)::int from storage.objects where bucket_id = 'receipts' $$,
    $$ values (0) $$,
    'Carol, hors de l’espace, ne voit aucun objet')
  else skip('pas de tables storage accessibles sur cette pile') end;
select case when current_setting('test.storage', true) = 'on'
  then throws_ok(
    $$ insert into storage.objects (bucket_id, name, owner)
       values ('receipts', 'e0000000-0000-4000-8000-000000000001/x/c.jpg', auth.uid()) $$,
    '42501', null,
    'et ne peut rien y déposer')
  else skip('pas de tables storage accessibles sur cette pile') end;

set local request.jwt.claims to
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select case when current_setting('test.storage', true) = 'on'
  then lives_ok(
    $$ delete from storage.objects
        where bucket_id = 'receipts'
          and name = 'e0000000-0000-4000-8000-000000000001/x/a.jpg' $$,
    'Alice retire son objet')
  else skip('pas de tables storage accessibles sur cette pile') end;

reset role;

select * from finish();
rollback;
