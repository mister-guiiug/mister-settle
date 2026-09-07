-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Les fonctions — tout ce qui touche plusieurs lignes, ou qui calcule.     ║
-- ║                                                                          ║
-- ║ `security definer`, `search_path` figé, exécution donnée au seul         ║
-- ║ `authenticated`. Chacune vérifie elle-même le rôle de l'appelant par les ║
-- ║ fonctions d'appartenance (0006) : `security definer` traverse la RLS,    ║
-- ║ donc rien ne la protège à sa place.                                      ║
-- ║                                                                          ║
-- ║ CODES D'ERREUR. La RLS et les refus de droit rendent `42501`. Les refus  ║
-- ║ métier portent des SQLSTATE propres, que le client sait lire :           ║
-- ║   ST404  introuvable          ST409  version périmée (conflit)           ║
-- ║   ST410  invitation révoquée  ST422  saisie refusée (le message dit quoi)║
-- ║                                                                          ║
-- ║ L'ALGORITHME DE RÉPARTITION vit ici en jumeau de `src/domain/split.ts`,  ║
-- ║ en entiers d'unités mineures, et les deux sont éprouvés sur les MÊMES    ║
-- ║ cas (`supabase/tests/repartition.test.sql` ↔ `split.test.ts`).          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ════════════════════════════════════════════════════════════════════════════
-- Monnaie entière (ADR 0011)
-- ════════════════════════════════════════════════════════════════════════════

-- `12.50` avec deux décimales → `1250`. Lève si le montant porte plus de
-- décimales que la devise : on ne cache jamais un centime.
create or replace function settle_minor(p_amount numeric, p_minor_unit integer)
returns bigint
language plpgsql immutable as $$
declare
  v numeric := p_amount * (10::numeric ^ p_minor_unit);
begin
  if v <> trunc(v) then
    raise exception 'montant % à plus de % décimale(s)', p_amount, p_minor_unit
      using errcode = 'ST422';
  end if;
  return v::bigint;
end;
$$;

create or replace function settle_from_minor(p_minor bigint, p_minor_unit integer)
returns numeric
language sql immutable as $$
  select p_minor::numeric / (10::numeric ^ p_minor_unit);
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- La répartition — jumeau SQL de split.ts
-- ════════════════════════════════════════════════════════════════════════════

-- Les colonnes rendues portent un préfixe : dans plpgsql, un paramètre de
-- sortie nommé comme une colonne rend chaque requête ambiguë.
create or replace function settle_split(p_expense uuid)
returns table (out_participant uuid, out_amount numeric)
language plpgsql stable security definer set search_path = public as $$
declare
  v expenses%rowtype;
  v_mu integer;
  v_total bigint;
  v_count integer;
  v_base bigint;
  v_rem bigint;
  v_shares numeric;
begin
  select * into v from expenses e where e.id = p_expense;
  if not found then
    raise exception 'dépense introuvable' using errcode = 'ST404';
  end if;
  select minor_unit into v_mu from expense_spaces s where s.id = v.space_id;
  v_total := settle_minor(v.amount, v_mu);

  if v.split_method = 'equal' then
    -- Quotient entier pour tous ; les `rem` premiers dans l'ordre stable
    -- (position, puis identifiant) reçoivent un centime de plus.
    select count(*) into v_count from expense_beneficiaries b where b.expense_id = p_expense;
    if v_count = 0 then
      raise exception 'aucun bénéficiaire' using errcode = 'ST422';
    end if;
    v_base := v_total / v_count;
    v_rem := v_total - v_base * v_count;
    return query
      select ranked.participant_id,
             settle_from_minor(v_base + case when ranked.rn <= v_rem then 1 else 0 end, v_mu)
        from (
          select b.participant_id,
                 row_number() over (order by b.position, b.participant_id) as rn
            from expense_beneficiaries b
           where b.expense_id = p_expense
        ) ranked;

  elsif v.split_method = 'amount' then
    -- Les montants saisis, tels quels : c'est `validate_expense` qui refuse
    -- une somme fausse avant d'arriver ici.
    return query
      select b.participant_id, coalesce(b.amount_input, 0)
        from expense_beneficiaries b
       where b.expense_id = p_expense;

  else
    -- Plus forts restes (Hamilton), en arithmétique EXACTE : `div` et `mod`
    -- sur des numériques entiers — les parts sont mises à l'échelle 10⁴,
    -- comme `SHARES_SCALE` côté client.
    select sum(round(coalesce(b.shares, 0) * 10000)) into v_shares
      from expense_beneficiaries b where b.expense_id = p_expense;
    if v_shares is null or v_shares <= 0 then
      raise exception 'aucune part positive' using errcode = 'ST422';
    end if;
    return query
      with lignes as (
        select b.participant_id,
               b.position,
               div(v_total::numeric * round(coalesce(b.shares, 0) * 10000), v_shares) as plancher,
               mod(v_total::numeric * round(coalesce(b.shares, 0) * 10000), v_shares) as reste
          from expense_beneficiaries b
         where b.expense_id = p_expense
      ),
      rangees as (
        select l.participant_id,
               l.plancher,
               row_number() over (order by l.reste desc, l.position, l.participant_id) as rang
          from lignes l
      ),
      reliquat as (
        select v_total - sum(l.plancher) as valeur from lignes l
      )
      select r.participant_id,
             settle_from_minor(
               (r.plancher + case when r.rang <= (select valeur from reliquat) then 1 else 0 end)::bigint,
               v_mu
             )
        from rangees r;
  end if;
end;
$$;

-- L'EMPREINTE DE CALCUL (ADR 0013) : tout ce qui, s'il change, fait tomber
-- une validation. Calculée sur les lignes STOCKÉES, donc comparable d'une
-- sauvegarde à l'autre sans dépendre d'un format client.
create or replace function settle_fingerprint(p_expense uuid) returns text
language sql stable security definer set search_path = public as $$
  select md5((jsonb_build_object(
    'amount', e.amount::text,
    'currency', e.currency,
    'fx', e.fx_rate::text,
    'method', e.split_method::text,
    'groups', (
      select coalesce(jsonb_agg(g::text order by g::text), '[]'::jsonb)
        from unnest(e.selected_group_ids) g
    ),
    'payers', (
      select coalesce(jsonb_agg(jsonb_build_array(p.participant_id::text, p.amount::text)
                                order by p.participant_id), '[]'::jsonb)
        from expense_payers p where p.expense_id = e.id
    ),
    'beneficiaries', (
      select coalesce(jsonb_agg(jsonb_build_array(
               b.participant_id::text,
               case when e.split_method = 'amount' then b.amount_input::text end,
               case when e.split_method = 'shares' then b.shares::text end
             ) order by b.participant_id), '[]'::jsonb)
        from expense_beneficiaries b where b.expense_id = e.id
    )
  ))::text)
  from expenses e where e.id = p_expense;
$$;

-- L'instantané d'une révision : la dépense et ses trois couches.
create or replace function settle_expense_snapshot(p_expense uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'expense', to_jsonb(e) - 'validated_fingerprint',
    'payers', (select coalesce(jsonb_agg(to_jsonb(p) order by p.participant_id), '[]'::jsonb)
                 from expense_payers p where p.expense_id = e.id),
    'beneficiaries', (select coalesce(jsonb_agg(to_jsonb(b) order by b.participant_id), '[]'::jsonb)
                        from expense_beneficiaries b where b.expense_id = e.id),
    'allocations', (select coalesce(jsonb_agg(to_jsonb(a) order by a.participant_id), '[]'::jsonb)
                      from expense_allocations a where a.expense_id = e.id)
  )
  from expenses e where e.id = p_expense;
$$;

revoke execute on function settle_minor(numeric, integer), settle_from_minor(bigint, integer),
  settle_split(uuid), settle_fingerprint(uuid), settle_expense_snapshot(uuid)
  from public, anon;
grant execute on function settle_minor(numeric, integer), settle_from_minor(bigint, integer),
  settle_split(uuid), settle_fingerprint(uuid), settle_expense_snapshot(uuid)
  to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- Espaces
-- ════════════════════════════════════════════════════════════════════════════

-- Décimales d'une devise ISO 4217 — la même table que `money.ts`.
create or replace function settle_minor_unit_of(p_currency text) returns smallint
language sql immutable as $$
  select case upper(p_currency)
    when 'JPY' then 0 when 'KRW' then 0 when 'VND' then 0 when 'CLP' then 0
    when 'ISK' then 0 when 'XOF' then 0 when 'XAF' then 0
    when 'KWD' then 3 when 'BHD' then 3 when 'OMR' then 3 when 'JOD' then 3
    when 'TND' then 3 when 'IQD' then 3 when 'LYD' then 3
    else 2 end::smallint;
$$;

-- UN ESPACE NAÎT ENTIER : lui, son propriétaire, et la personne qu'est ce
-- propriétaire — rattachée. Trois lignes, une transaction, aucune fenêtre où
-- un espace existe sans membre (le piège que carbook a corrigé deux fois).
create or replace function create_space(
  p_name text,
  p_currency text,
  p_description text default '',
  p_icon text default '',
  p_color text default '',
  p_me_name text default null,
  p_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  v_id uuid := coalesce(p_id, gen_random_uuid());
  v_me uuid := gen_random_uuid();
  v_name text;
begin
  if uid is null then
    raise exception 'session requise' using errcode = '42501';
  end if;
  insert into expense_spaces (id, name, description, currency, minor_unit, icon, color, created_by)
  values (v_id, trim(p_name), coalesce(p_description, ''), upper(p_currency),
          settle_minor_unit_of(p_currency), coalesce(p_icon, ''), coalesce(p_color, ''), uid);

  insert into space_memberships (space_id, user_id, role) values (v_id, uid, 'owner');

  select coalesce(nullif(trim(p_me_name), ''), pr.display_name, 'Moi')
    into v_name from profiles pr where pr.id = uid;
  v_name := coalesce(v_name, nullif(trim(p_me_name), ''), 'Moi');

  insert into participants (id, space_id, display_name, position, created_by)
  values (v_me, v_id, left(v_name, 60), 0, uid);
  insert into participant_user_links (participant_id, user_id, linked_by)
  values (v_me, uid, uid);

  perform log_activity(v_id, 'expense_spaces', v_id, 'insert',
                       jsonb_build_object('label', trim(p_name)));
  return v_id;
end;
$$;

-- Le propriétaire passe la main à un membre ; il devient administrateur.
create or replace function transfer_space_ownership(p_space uuid, p_new_owner uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not is_space_owner(p_space) then
    raise exception 'seul le propriétaire transfère son espace' using errcode = '42501';
  end if;
  if not exists (select 1 from space_memberships where space_id = p_space and user_id = p_new_owner) then
    raise exception 'le nouveau propriétaire doit déjà être membre' using errcode = 'ST422';
  end if;
  perform set_config('settle.transfer', 'on', true);
  update space_memberships set role = 'admin' where space_id = p_space and role = 'owner';
  update space_memberships set role = 'owner' where space_id = p_space and user_id = p_new_owner;
  perform set_config('settle.transfer', 'off', true);
  perform log_activity(p_space, 'space_memberships', p_new_owner, 'transfer', '{}'::jsonb);
end;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- Dépenses
-- ════════════════════════════════════════════════════════════════════════════

-- ENREGISTRER, c'est réécrire la saisie et décider ce qu'il advient de la
-- validation : si l'empreinte de calcul n'a pas bougé (un libellé, une note,
-- une date), la dépense reste validée et ses allocations aussi ; sinon elle
-- retombe en brouillon, et ses allocations sont retirées — elles ne
-- correspondent plus à rien.
create or replace function save_expense(p_expense jsonb, p_expected_version integer default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  v_id uuid := coalesce(nullif(p_expense ->> 'id', '')::uuid, gen_random_uuid());
  v_space uuid := (p_expense ->> 'space_id')::uuid;
  v_mu integer;
  v_old expenses%rowtype;
  v_new expenses%rowtype;
  v_item jsonb;
  v_fp text;
  v_groups uuid[];
  v_amount numeric := (p_expense ->> 'amount')::numeric;
begin
  if uid is null then
    raise exception 'session requise' using errcode = '42501';
  end if;
  if v_space is null or not can_contribute(v_space) then
    raise exception 'écriture refusée dans cet espace' using errcode = '42501';
  end if;
  select minor_unit into v_mu from expense_spaces where id = v_space;
  -- Une échelle au-delà de la devise est refusée avant tout calcul.
  perform settle_minor(v_amount, v_mu);

  select coalesce(array_agg(g::uuid), '{}'::uuid[]) into v_groups
    from jsonb_array_elements_text(coalesce(p_expense -> 'selected_group_ids', '[]'::jsonb)) g;

  select * into v_old from expenses where id = v_id;
  if found then
    if v_old.space_id <> v_space then
      raise exception 'dépense d''un autre espace' using errcode = '42501';
    end if;
    if v_old.status = 'archived' then
      raise exception 'dépense archivée' using errcode = 'ST422';
    end if;
    if p_expected_version is not null and v_old.version <> p_expected_version then
      raise exception 'version périmée' using errcode = 'ST409';
    end if;
    update expenses
       set label = trim(p_expense ->> 'label'),
           amount = v_amount,
           currency = upper(coalesce(p_expense ->> 'currency', currency)),
           fx_rate = nullif(p_expense ->> 'fx_rate', '')::numeric,
           spent_on = coalesce(nullif(p_expense ->> 'spent_on', '')::date, spent_on),
           category_id = nullif(p_expense ->> 'category_id', '')::uuid,
           subcategory_id = nullif(p_expense ->> 'subcategory_id', '')::uuid,
           note = coalesce(p_expense ->> 'note', ''),
           split_method = (p_expense ->> 'split_method')::split_method,
           selected_group_ids = v_groups,
           version = version + 1,
           updated_at = now()
     where id = v_id;
  else
    insert into expenses (id, space_id, label, amount, currency, fx_rate, spent_on,
                          category_id, subcategory_id, note, split_method,
                          selected_group_ids, status, created_by)
    values (v_id, v_space, trim(p_expense ->> 'label'), v_amount,
            upper(coalesce(p_expense ->> 'currency',
                           (select currency from expense_spaces where id = v_space))),
            nullif(p_expense ->> 'fx_rate', '')::numeric,
            coalesce(nullif(p_expense ->> 'spent_on', '')::date, current_date),
            nullif(p_expense ->> 'category_id', '')::uuid,
            nullif(p_expense ->> 'subcategory_id', '')::uuid,
            coalesce(p_expense ->> 'note', ''),
            coalesce((p_expense ->> 'split_method')::split_method, 'equal'),
            v_groups, 'draft', uid);
  end if;

  delete from expense_payers where expense_id = v_id;
  for v_item in select * from jsonb_array_elements(coalesce(p_expense -> 'payers', '[]'::jsonb)) loop
    perform settle_minor((v_item ->> 'amount')::numeric, v_mu);
    insert into expense_payers (expense_id, participant_id, amount)
    values (v_id, (v_item ->> 'participant_id')::uuid, (v_item ->> 'amount')::numeric);
  end loop;

  delete from expense_beneficiaries where expense_id = v_id;
  for v_item in select * from jsonb_array_elements(coalesce(p_expense -> 'beneficiaries', '[]'::jsonb)) loop
    if v_item ->> 'amount_input' is not null then
      perform settle_minor((v_item ->> 'amount_input')::numeric, v_mu);
    end if;
    insert into expense_beneficiaries (expense_id, participant_id, via_group_id, shares, amount_input, position)
    values (v_id, (v_item ->> 'participant_id')::uuid,
            nullif(v_item ->> 'via_group_id', '')::uuid,
            nullif(v_item ->> 'shares', '')::numeric,
            nullif(v_item ->> 'amount_input', '')::numeric,
            coalesce((v_item ->> 'position')::integer, 0));
  end loop;

  v_fp := settle_fingerprint(v_id);
  if v_old.id is not null and v_old.status = 'validated' and v_old.validated_fingerprint = v_fp then
    null; -- rien du calcul n'a changé : la validation tient, les allocations aussi
  else
    update expenses
       set status = 'draft', validated_at = null, validated_by = null, validated_fingerprint = null
     where id = v_id;
    delete from expense_allocations where expense_id = v_id;
    delete from expense_group_snapshots where expense_id = v_id;
  end if;

  select * into v_new from expenses where id = v_id;
  insert into expense_revisions (expense_id, version, snapshot, changed_by, reason)
  values (v_id, v_new.version, settle_expense_snapshot(v_id), uid,
          case when v_old.id is null then 'created' else 'saved' end);
  perform log_activity(v_space, 'expenses', v_id,
                       case when v_old.id is null then 'insert' else 'update' end,
                       jsonb_build_object('label', v_new.label, 'amount', v_new.amount::text,
                                          'status', v_new.status::text));
  return jsonb_build_object('id', v_id, 'version', v_new.version, 'status', v_new.status);
end;
$$;

-- VALIDER, c'est recalculer. Le serveur ne fait pas confiance aux allocations
-- que le client aurait pu envoyer : il refait la somme des payeurs, la somme
-- des montants saisis, l'existence d'une part positive, puis `settle_split`,
-- et il affirme que la somme des allocations est le montant — l'invariant
-- qui donne son sens à tout le reste.
create or replace function validate_expense(p_expense_id uuid, p_expected_version integer)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  v expenses%rowtype;
  v_sum numeric;
  v_count integer;
  v_fp text;
begin
  if uid is null then
    raise exception 'session requise' using errcode = '42501';
  end if;
  select * into v from expenses where id = p_expense_id;
  if not found then
    raise exception 'dépense introuvable' using errcode = 'ST404';
  end if;
  if not can_contribute(v.space_id) then
    raise exception 'écriture refusée dans cet espace' using errcode = '42501';
  end if;
  if v.version <> p_expected_version then
    raise exception 'version périmée' using errcode = 'ST409';
  end if;
  if v.status = 'archived' then
    raise exception 'dépense archivée' using errcode = 'ST422';
  end if;

  select coalesce(sum(amount), 0), count(*) into v_sum, v_count
    from expense_payers where expense_id = v.id;
  if v_count = 0 then
    raise exception 'no-payer' using errcode = 'ST422';
  end if;
  if v_sum <> v.amount then
    raise exception 'payers-sum-mismatch' using errcode = 'ST422';
  end if;

  select count(*) into v_count from expense_beneficiaries where expense_id = v.id;
  if v_count = 0 then
    raise exception 'no-beneficiary' using errcode = 'ST422';
  end if;
  if v.split_method = 'amount' then
    select coalesce(sum(amount_input), 0) into v_sum
      from expense_beneficiaries where expense_id = v.id;
    if v_sum <> v.amount then
      raise exception 'amounts-sum-mismatch' using errcode = 'ST422';
    end if;
  elsif v.split_method = 'shares' then
    if not exists (select 1 from expense_beneficiaries
                    where expense_id = v.id and coalesce(shares, 0) > 0) then
      raise exception 'shares-none-positive' using errcode = 'ST422';
    end if;
  end if;

  delete from expense_allocations where expense_id = v.id;
  insert into expense_allocations (expense_id, participant_id, amount)
  select v.id, s.out_participant, s.out_amount from settle_split(v.id) s;

  select sum(amount) into v_sum from expense_allocations where expense_id = v.id;
  if v_sum <> v.amount then
    raise exception 'allocations-sum-mismatch : % pour %', v_sum, v.amount
      using errcode = 'ST500';
  end if;

  -- La composition des regroupements, FIGÉE (ADR 0012) : ceux cochés pour
  -- sélectionner, et ceux par lesquels une personne est entrée.
  delete from expense_group_snapshots where expense_id = v.id;
  insert into expense_group_snapshots (expense_id, group_id, group_name, member_participant_ids)
  select v.id, g.id, g.name,
         coalesce(array_agg(m.participant_id order by m.participant_id)
                  filter (where m.participant_id is not null), '{}'::uuid[])
    from participant_groups g
    left join participant_group_members m on m.group_id = g.id
   where g.id = any (v.selected_group_ids)
      or g.id in (select via_group_id from expense_beneficiaries
                   where expense_id = v.id and via_group_id is not null)
   group by g.id, g.name;

  v_fp := settle_fingerprint(v.id);
  update expenses
     set status = 'validated', validated_at = now(), validated_by = uid,
         validated_fingerprint = v_fp, version = version + 1, updated_at = now()
   where id = v.id;

  insert into expense_revisions (expense_id, version, snapshot, changed_by, reason)
  values (v.id, v.version + 1, settle_expense_snapshot(v.id), uid, 'validated');
  perform log_activity(v.space_id, 'expenses', v.id, 'validate',
                       jsonb_build_object('label', v.label, 'amount', v.amount::text));
  return jsonb_build_object('id', v.id, 'version', v.version + 1, 'status', 'validated');
end;
$$;

-- Archiver garde tout ; réactiver rend la dépense à l'état qu'elle avait —
-- validée si elle l'était, brouillon sinon.
create or replace function archive_expense(p_expense_id uuid, p_archived boolean, p_expected_version integer)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  v expenses%rowtype;
  v_status expense_status;
begin
  if uid is null then
    raise exception 'session requise' using errcode = '42501';
  end if;
  select * into v from expenses where id = p_expense_id;
  if not found then
    raise exception 'dépense introuvable' using errcode = 'ST404';
  end if;
  if not can_contribute(v.space_id) then
    raise exception 'écriture refusée dans cet espace' using errcode = '42501';
  end if;
  if v.version <> p_expected_version then
    raise exception 'version périmée' using errcode = 'ST409';
  end if;
  v_status := case
    when p_archived then 'archived'::expense_status
    when v.validated_at is not null then 'validated'::expense_status
    else 'draft'::expense_status end;
  update expenses set status = v_status, version = version + 1, updated_at = now()
   where id = v.id;
  perform log_activity(v.space_id, 'expenses', v.id,
                       case when p_archived then 'archive' else 'unarchive' end,
                       jsonb_build_object('label', v.label));
  return jsonb_build_object('id', v.id, 'version', v.version + 1, 'status', v_status);
end;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- Invitations et rattachements
-- ════════════════════════════════════════════════════════════════════════════

-- Le jeton est rendu UNE fois ; la base n'en garde que le SHA-256.
create or replace function create_invitation(
  p_space uuid,
  p_role space_role default 'contributor',
  p_target uuid default null,
  p_expires interval default interval '7 days',
  p_max_uses integer default 1
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_token text := encode(extensions.gen_random_bytes(24), 'hex');
  v_id uuid;
  v_expires timestamptz := now() + p_expires;
begin
  if auth.uid() is null or not is_space_admin(p_space) then
    raise exception 'seul un administrateur invite' using errcode = '42501';
  end if;
  if p_role = 'owner' then
    raise exception 'une invitation ne donne pas la propriété' using errcode = 'ST422';
  end if;
  if p_target is not null and not exists (
    select 1 from participants where id = p_target and space_id = p_space
  ) then
    raise exception 'personne ciblée hors de l''espace' using errcode = 'ST422';
  end if;
  insert into invitations (space_id, token_hash, role, target_participant_id, expires_at, max_uses, created_by)
  values (p_space, encode(extensions.digest(v_token, 'sha256'), 'hex'), p_role, p_target,
          v_expires, coalesce(p_max_uses, 1), auth.uid())
  returning id into v_id;
  perform log_activity(p_space, 'invitations', v_id, 'insert',
                       jsonb_build_object('role', p_role::text));
  return jsonb_build_object('id', v_id, 'token', v_token, 'expires_at', v_expires);
end;
$$;

-- Accepter : devenir membre avec le rôle porté, et — si l'administrateur a
-- désigné une personne, ou si l'invité en choisit une libre — s'y rattacher.
create or replace function accept_invitation(p_token text, p_participant uuid default null)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  uid uuid := auth.uid();
  inv invitations%rowtype;
  v_target uuid;
begin
  if uid is null then
    raise exception 'session requise' using errcode = '42501';
  end if;
  select * into inv from invitations
   where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
  if not found then
    raise exception 'invitation inconnue' using errcode = 'ST404';
  end if;
  if inv.revoked_at is not null then
    raise exception 'invitation révoquée' using errcode = 'ST410';
  end if;
  if inv.expires_at < now() then
    raise exception 'invitation expirée' using errcode = 'ST410';
  end if;
  if inv.uses >= inv.max_uses then
    raise exception 'invitation épuisée' using errcode = 'ST410';
  end if;

  insert into space_memberships (space_id, user_id, role, invited_by)
  values (inv.space_id, uid, inv.role, inv.created_by)
  on conflict (space_id, user_id) do nothing;

  v_target := coalesce(inv.target_participant_id, p_participant);
  if v_target is not null then
    if not exists (select 1 from participants where id = v_target and space_id = inv.space_id) then
      raise exception 'personne hors de l''espace' using errcode = 'ST422';
    end if;
    if exists (select 1 from participant_user_links
                where participant_id = v_target and unlinked_at is null and user_id <> uid) then
      raise exception 'personne déjà rattachée à un autre compte' using errcode = 'ST422';
    end if;
    if not exists (select 1 from participant_user_links
                    where participant_id = v_target and unlinked_at is null) then
      insert into participant_user_links (participant_id, user_id, linked_by)
      values (v_target, uid, inv.created_by);
    end if;
  end if;

  update invitations set uses = uses + 1 where id = inv.id;
  perform log_activity(inv.space_id, 'invitations', inv.id, 'accept',
                       jsonb_build_object('role', inv.role::text));
  return jsonb_build_object('space_id', inv.space_id, 'participant_id', v_target,
                            'role', inv.role);
end;
$$;

-- Se rattacher soi-même à une personne libre d'un espace dont on est membre.
create or replace function link_participant(p_participant uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  v_space uuid;
begin
  if uid is null then
    raise exception 'session requise' using errcode = '42501';
  end if;
  select space_id into v_space from participants where id = p_participant;
  if v_space is null or not is_space_member(v_space) then
    raise exception 'personne hors de vos espaces' using errcode = '42501';
  end if;
  if exists (select 1 from participant_user_links
              where participant_id = p_participant and unlinked_at is null) then
    raise exception 'personne déjà rattachée' using errcode = 'ST422';
  end if;
  insert into participant_user_links (participant_id, user_id, linked_by)
  values (p_participant, uid, uid);
  perform log_activity(v_space, 'participants', p_participant, 'link', '{}'::jsonb);
end;
$$;

-- Détacher : l'administrateur, ou le compte lui-même.
create or replace function unlink_participant(p_participant uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  v_space uuid;
  v_user uuid;
begin
  if uid is null then
    raise exception 'session requise' using errcode = '42501';
  end if;
  select space_id into v_space from participants where id = p_participant;
  select user_id into v_user from participant_user_links
   where participant_id = p_participant and unlinked_at is null;
  if v_user is null then
    return;
  end if;
  if not (is_space_admin(v_space) or v_user = uid) then
    raise exception 'détachement refusé' using errcode = '42501';
  end if;
  update participant_user_links set unlinked_at = now()
   where participant_id = p_participant and unlinked_at is null;
  perform log_activity(v_space, 'participants', p_participant, 'unlink', '{}'::jsonb);
end;
$$;

revoke execute on function
  create_space(text, text, text, text, text, text, uuid),
  transfer_space_ownership(uuid, uuid),
  save_expense(jsonb, integer),
  validate_expense(uuid, integer),
  archive_expense(uuid, boolean, integer),
  create_invitation(uuid, space_role, uuid, interval, integer),
  accept_invitation(text, uuid),
  link_participant(uuid),
  unlink_participant(uuid),
  settle_minor_unit_of(text)
  from public, anon;
grant execute on function
  create_space(text, text, text, text, text, text, uuid),
  transfer_space_ownership(uuid, uuid),
  save_expense(jsonb, integer),
  validate_expense(uuid, integer),
  archive_expense(uuid, boolean, integer),
  create_invitation(uuid, space_role, uuid, interval, integer),
  accept_invitation(text, uuid),
  link_participant(uuid),
  unlink_participant(uuid),
  settle_minor_unit_of(text)
  to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- Soldes — calculés, jamais stockés
-- ════════════════════════════════════════════════════════════════════════════

-- `solde = payé − dû + remboursements émis − remboursements reçus`, sur les
-- dépenses VALIDÉES et les remboursements ENREGISTRÉS. `security_invoker` :
-- la RLS des tables s'applique sous le rôle de l'appelant.
create view space_balances with (security_invoker = true) as
  with paid as (
    select e.space_id, p.participant_id, sum(p.amount) as paid
      from expenses e join expense_payers p on p.expense_id = e.id
     where e.status = 'validated'
     group by e.space_id, p.participant_id
  ),
  owed as (
    select e.space_id, a.participant_id, sum(a.amount) as owed
      from expenses e join expense_allocations a on a.expense_id = e.id
     where e.status = 'validated'
     group by e.space_id, a.participant_id
  ),
  sent as (
    select space_id, from_participant_id as participant_id, sum(amount) as sent
      from settlements where status = 'recorded'
     group by space_id, from_participant_id
  ),
  received as (
    select space_id, to_participant_id as participant_id, sum(amount) as received
      from settlements where status = 'recorded'
     group by space_id, to_participant_id
  )
  select pa.space_id,
         pa.id as participant_id,
         coalesce(paid.paid, 0) as paid,
         coalesce(owed.owed, 0) as owed,
         coalesce(sent.sent, 0) as sent,
         coalesce(received.received, 0) as received,
         coalesce(paid.paid, 0) - coalesce(owed.owed, 0)
           + coalesce(sent.sent, 0) - coalesce(received.received, 0) as net
    from participants pa
    left join paid on paid.space_id = pa.space_id and paid.participant_id = pa.id
    left join owed on owed.space_id = pa.space_id and owed.participant_id = pa.id
    left join sent on sent.space_id = pa.space_id and sent.participant_id = pa.id
    left join received on received.space_id = pa.space_id and received.participant_id = pa.id;

grant select on space_balances to authenticated;
