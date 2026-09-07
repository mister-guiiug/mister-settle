-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Les dépenses, en deux couches — et tout ce qui les entoure.              ║
-- ║                                                                          ║
-- ║ LA SAISIE : `expenses` (le cadre), `expense_payers` (qui a payé),        ║
-- ║ `expense_beneficiaries` (pour qui, avec les montants ou les parts        ║
-- ║ tapés), `expense_group_snapshots` (les regroupements tels qu'ils étaient ║
-- ║ au moment de valider — ADR 0012).                                        ║
-- ║                                                                          ║
-- ║ LE RÉSULTAT : `expense_allocations`, ce que chaque personne doit. Cette  ║
-- ║ table n'est JAMAIS écrite par le client : `validate_expense` (0009) la   ║
-- ║ recalcule en SQL, avec le même algorithme que `src/domain/split.ts`,     ║
-- ║ puis passe la dépense en `validated`. Aucun grant d'écriture pour        ║
-- ║ `authenticated` (0008) — c'est l'ADR 0013 dans le schéma.               ║
-- ║                                                                          ║
-- ║ LES MONTANTS sont `numeric(16,4)` : quatre décimales, pour porter le     ║
-- ║ dinar à trois sans arrondir ; c'est `minor_unit` de l'espace qui borne   ║
-- ║ l'échelle réellement admise (contrôlée dans les fonctions de 0009).      ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

create type split_method as enum ('equal', 'amount', 'shares');
create type expense_status as enum ('draft', 'validated', 'archived');
create type settlement_status as enum ('recorded', 'cancelled');

-- ════════════════════════════════════════════════════════════════════════════
-- Dépenses
-- ════════════════════════════════════════════════════════════════════════════

create table expenses (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references expense_spaces (id) on delete cascade,
  label text not null check (char_length(label) between 1 and 120),
  amount numeric(16, 4) not null check (amount > 0),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  -- Taux figé quand la devise n'est pas celle de l'espace (V2) ; nul sinon.
  fx_rate numeric(18, 8) check (fx_rate is null or fx_rate > 0),
  spent_on date not null default current_date,
  category_id uuid references categories (id) on delete set null,
  subcategory_id uuid references categories (id) on delete set null,
  note text not null default '' check (char_length(note) <= 2000),
  split_method split_method not null default 'equal',
  -- Les regroupements cochés pour sélectionner : ils font partie de
  -- l'empreinte de calcul (ADR 0013).
  selected_group_ids uuid[] not null default '{}',
  status expense_status not null default 'draft',
  validated_at timestamptz,
  validated_by uuid references auth.users (id) on delete set null,
  validated_fingerprint text,
  version integer not null default 1,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Une dépense validée porte sa date de validation ; un brouillon n'en a
  -- pas ; une dépense archivée garde la sienne, si elle en avait une.
  constraint expenses_validated_consistent
    check (status <> 'validated' or validated_at is not null),
  constraint expenses_draft_consistent
    check (status <> 'draft' or validated_at is null)
);

alter table expenses enable row level security;

create index expenses_space_date_idx on expenses (space_id, spent_on desc, id);
create index expenses_space_status_idx on expenses (space_id, status);
create index expenses_category_idx on expenses (category_id);

create table expense_payers (
  expense_id uuid not null references expenses (id) on delete cascade,
  -- Une personne qui a payé ne se supprime pas, elle s'archive : la clé
  -- étrangère (contrôle différé en fin d'instruction) refuse sa suppression
  -- directe, tout en laissant passer la cascade d'un espace supprimé.
  participant_id uuid not null references participants (id),
  amount numeric(16, 4) not null check (amount > 0),
  primary key (expense_id, participant_id)
);

alter table expense_payers enable row level security;

create table expense_beneficiaries (
  expense_id uuid not null references expenses (id) on delete cascade,
  participant_id uuid not null references participants (id),
  -- D'où la personne est venue dans la sélection : un affichage, jamais un
  -- calcul. Le regroupement peut disparaître, la trace reste (`set null`).
  via_group_id uuid references participant_groups (id) on delete set null,
  -- Modèle `shares` : les parts ; modèle `amount` : le montant saisi.
  shares numeric(10, 4) check (shares is null or shares >= 0),
  amount_input numeric(16, 4) check (amount_input is null or amount_input >= 0),
  position integer not null default 0,
  primary key (expense_id, participant_id)
);

alter table expense_beneficiaries enable row level security;

create table expense_allocations (
  expense_id uuid not null references expenses (id) on delete cascade,
  participant_id uuid not null references participants (id),
  amount numeric(16, 4) not null check (amount >= 0),
  computed_at timestamptz not null default now(),
  primary key (expense_id, participant_id)
);

alter table expense_allocations enable row level security;

create table expense_group_snapshots (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references expenses (id) on delete cascade,
  group_id uuid references participant_groups (id) on delete set null,
  group_name text not null,
  member_participant_ids uuid[] not null,
  snapshot_at timestamptz not null default now()
);

alter table expense_group_snapshots enable row level security;

create index expense_group_snapshots_expense_idx
  on expense_group_snapshots (expense_id);

-- L'historique : un instantané complet par version, jamais modifié.
create table expense_revisions (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references expenses (id) on delete cascade,
  version integer not null,
  snapshot jsonb not null,
  changed_by uuid references auth.users (id) on delete set null,
  changed_at timestamptz not null default now(),
  reason text not null default '',
  unique (expense_id, version)
);

alter table expense_revisions enable row level security;

-- Payeurs, bénéficiaires et allocations nomment des personnes DE L'ESPACE de
-- la dépense — jamais d'un autre.
create or replace function expense_lines_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select space_id from expenses where id = new.expense_id)
     is distinct from
     (select space_id from participants where id = new.participant_id) then
    raise exception 'personne d''un autre espace que la dépense'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger expense_payers_guard
  before insert or update on expense_payers
  for each row execute function expense_lines_guard();
create trigger expense_beneficiaries_guard
  before insert or update on expense_beneficiaries
  for each row execute function expense_lines_guard();
create trigger expense_allocations_guard
  before insert or update on expense_allocations
  for each row execute function expense_lines_guard();

-- ════════════════════════════════════════════════════════════════════════════
-- Remboursements déclarés — informatifs, jamais un mouvement d'argent
-- ════════════════════════════════════════════════════════════════════════════

create table settlements (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references expense_spaces (id) on delete cascade,
  from_participant_id uuid not null references participants (id),
  to_participant_id uuid not null references participants (id),
  amount numeric(16, 4) not null check (amount > 0),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  settled_on date not null default current_date,
  note text not null default '' check (char_length(note) <= 500),
  status settlement_status not null default 'recorded',
  version integer not null default 1,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint settlements_two_people check (from_participant_id <> to_participant_id)
);

alter table settlements enable row level security;

create index settlements_space_date_idx on settlements (space_id, settled_on desc, id);

create trigger settlements_bump_version
  before update on settlements
  for each row execute function bump_version();

create or replace function settlements_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select space_id from participants where id = new.from_participant_id) <> new.space_id
     or (select space_id from participants where id = new.to_participant_id) <> new.space_id then
    raise exception 'remboursement entre personnes d''un autre espace'
      using errcode = '23514';
  end if;
  -- L'auteur ne se réécrit pas.
  if tg_op = 'UPDATE' and new.created_by is distinct from old.created_by then
    raise exception 'l''auteur d''un remboursement ne change pas'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger settlements_guard
  before insert or update on settlements
  for each row execute function settlements_guard();

-- ════════════════════════════════════════════════════════════════════════════
-- Justificatifs — des références vers un bucket PRIVÉ
-- ════════════════════════════════════════════════════════════════════════════

create table attachments (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references expense_spaces (id) on delete cascade,
  expense_id uuid references expenses (id) on delete cascade,
  settlement_id uuid references settlements (id) on delete cascade,
  -- `<space_id>/<parent_id>/<uuid>.<ext>` : le préfixe est ce que les
  -- politiques du stockage lisent pour décider.
  storage_path text not null unique,
  mime text not null check (mime in ('image/jpeg', 'image/png', 'image/webp')),
  bytes integer not null check (bytes > 0 and bytes <= 5242880),
  sha256 text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint attachments_one_parent
    check ((expense_id is null) <> (settlement_id is null)),
  constraint attachments_path_in_space
    check (storage_path like (space_id::text || '/%'))
);

alter table attachments enable row level security;

create index attachments_expense_idx on attachments (expense_id);
create index attachments_settlement_idx on attachments (settlement_id);

create or replace function attachments_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.expense_id is not null
     and (select space_id from expenses where id = new.expense_id) <> new.space_id then
    raise exception 'justificatif d''une dépense d''un autre espace'
      using errcode = '23514';
  end if;
  if new.settlement_id is not null
     and (select space_id from settlements where id = new.settlement_id) <> new.space_id then
    raise exception 'preuve d''un remboursement d''un autre espace'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger attachments_guard
  before insert or update on attachments
  for each row execute function attachments_guard();

-- ════════════════════════════════════════════════════════════════════════════
-- Invitations — un jeton qu'on ne stocke jamais en clair
-- ════════════════════════════════════════════════════════════════════════════

create table invitations (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references expense_spaces (id) on delete cascade,
  -- SHA-256 du jeton. Le jeton lui-même n'est rendu qu'une fois, à la
  -- création (`create_invitation`, 0009), et la table n'est lisible que des
  -- administrateurs : un lien d'invitation n'est donc jamais énumérable.
  token_hash text not null unique,
  role space_role not null default 'contributor' check (role <> 'owner'),
  -- La personne que l'invité DEVIENT, si l'administrateur l'a désignée.
  target_participant_id uuid references participants (id) on delete set null,
  expires_at timestamptz not null,
  max_uses integer not null default 1 check (max_uses between 1 and 100),
  uses integer not null default 0 check (uses >= 0),
  revoked_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table invitations enable row level security;

create index invitations_space_idx on invitations (space_id);

-- ════════════════════════════════════════════════════════════════════════════
-- Journal d'activité — écrit par la base, jamais par le client
-- ════════════════════════════════════════════════════════════════════════════

create table activity_logs (
  id bigint generated always as identity primary key,
  space_id uuid not null references expense_spaces (id) on delete cascade,
  actor_user_id uuid references auth.users (id) on delete set null,
  entity text not null,
  entity_id uuid,
  action text not null,
  -- Rédigé : un libellé, un montant, un statut, un rôle — jamais un e-mail.
  payload jsonb not null default '{}'::jsonb,
  at timestamptz not null default now()
);

alter table activity_logs enable row level security;

create index activity_logs_space_idx on activity_logs (space_id, at desc);

create or replace function log_activity(
  p_space uuid,
  p_entity text,
  p_entity_id uuid,
  p_action text,
  p_payload jsonb default '{}'::jsonb
) returns void
language plpgsql security definer set search_path = public as $$
begin
  -- Pendant la suppression en cascade d'un espace, la ligne mère n'existe
  -- déjà plus : un journal qui la référencerait ferait échouer la cascade.
  if not exists (select 1 from expense_spaces where id = p_space) then
    return;
  end if;
  insert into activity_logs (space_id, actor_user_id, entity, entity_id, action, payload)
  values (p_space, auth.uid(), p_entity, p_entity_id, p_action,
          jsonb_strip_nulls(coalesce(p_payload, '{}'::jsonb)));
end;
$$;

revoke execute on function log_activity(uuid, text, uuid, text, jsonb) from public, anon, authenticated;

-- Le déclencheur générique : ce qui change sur une ligne d'espace laisse une
-- trace, avec le strict nécessaire pour la lire.
create or replace function activity_trigger() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  rec jsonb;
  v_id uuid;
begin
  rec := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_id := coalesce((rec ->> 'id')::uuid, (rec ->> 'user_id')::uuid);
  perform log_activity(
    (rec ->> 'space_id')::uuid,
    tg_table_name,
    v_id,
    lower(tg_op),
    jsonb_build_object(
      'label', coalesce(rec ->> 'display_name', rec ->> 'name', rec ->> 'label'),
      'amount', rec ->> 'amount',
      'status', rec ->> 'status',
      'role', rec ->> 'role'
    )
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger participants_activity
  after insert or update or delete on participants
  for each row execute function activity_trigger();
create trigger participant_groups_activity
  after insert or update or delete on participant_groups
  for each row execute function activity_trigger();
create trigger space_memberships_activity
  after insert or update or delete on space_memberships
  for each row execute function activity_trigger();
create trigger settlements_activity
  after insert or update or delete on settlements
  for each row execute function activity_trigger();
