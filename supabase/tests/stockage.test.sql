-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Le stockage des justificatifs — bucket privé, politiques par préfixe.    ║
-- ║                                                                          ║
-- ║ Le bucket existe et n'est pas public ; l'espace se lit dans le chemin ;  ║
-- ║ un membre dépose sous le préfixe de SON espace et pas d'un autre ; une   ║
-- ║ personne étrangère à l'espace ne voit rien et ne dépose rien.            ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

begin;
select plan(10);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'alice@exemple.test'),
  ('33333333-3333-3333-3333-333333333333', 'carol@exemple.test');

select is(
  (select public from storage.buckets where id = 'receipts'),
  false,
  'le bucket receipts existe, et il est privé'
);
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

-- ── Alice, propriétaire de son espace ─────────────────────────────────────

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select lives_ok(
  $$ select create_space('Bretagne', 'EUR', '', '', '', 'Alice',
                         'e0000000-0000-4000-8000-000000000001') $$,
  'Alice crée un espace'
);
select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner)
     values ('receipts', 'e0000000-0000-4000-8000-000000000001/x/a.jpg', auth.uid()) $$,
  'un membre dépose un objet sous le préfixe de son espace'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner)
     values ('receipts', 'f0000000-0000-4000-8000-000000000009/x/b.jpg', auth.uid()) $$,
  '42501', null,
  'mais pas sous le préfixe d’un espace étranger'
);

-- ── Carol, qui n'a rien à voir avec cet espace ────────────────────────────

set local request.jwt.claims to
  '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';

select is(
  (select count(*)::int from storage.objects where bucket_id = 'receipts'),
  0,
  'Carol, hors de l’espace, ne voit aucun objet'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner)
     values ('receipts', 'e0000000-0000-4000-8000-000000000001/x/c.jpg', auth.uid()) $$,
  '42501', null,
  'et ne peut rien y déposer'
);

-- ── Alice retire son objet ────────────────────────────────────────────────

set local request.jwt.claims to
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select lives_ok(
  $$ delete from storage.objects
      where bucket_id = 'receipts'
        and name = 'e0000000-0000-4000-8000-000000000001/x/a.jpg' $$,
  'Alice retire son objet'
);

reset role;
select is(
  (select count(*)::int from storage.objects where bucket_id = 'receipts'),
  0,
  'il n’en reste aucun'
);

select * from finish();
rollback;
