-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Les espaces, leurs membres, leurs personnes, leurs regroupements.        ║
-- ║                                                                          ║
-- ║ DEUX CONCEPTS QUI NE SE CONFONDENT PAS. Un COMPTE (`auth.users`) entre   ║
-- ║ dans un espace par une ADHÉSION (`space_memberships`), avec un rôle. Une ║
-- ║ PERSONNE (`participants`) est l'unité comptable : elle existe avec ou    ║
-- ║ sans compte, et un RATTACHEMENT (`participant_user_links`) peut relier   ║
-- ║ les deux plus tard, sans rien perdre. Un REGROUPEMENT                    ║
-- ║ (`participant_groups`) n'est jamais comptable : aucune table de montant  ║
-- ║ ne le référence — c'est l'ADR 0012, écrit dans le schéma.               ║
-- ║                                                                          ║
-- ║ LES TABLES NAISSENT VERROUILLÉES. `enable row level security` est posé  ║
-- ║ ici, et AUCUNE politique n'existe avant `0008_rls_espaces.sql`. Un       ║
-- ║ schéma poussé à moitié refuse donc tout, au lieu d'exposer.              ║
-- ║                                                                          ║
-- ║ LES DROITS SE DÉCIDENT ICI, PAR DES FONCTIONS. `space_role`,             ║
-- ║ `is_space_member`, `can_contribute`, `is_space_admin`, `is_space_owner`  ║
-- ║ sont `security definer` : appelées depuis les politiques, elles lisent   ║
-- ║ `space_memberships` sans que l'appelant y ait accès — le motif éprouvé   ║
-- ║ de miss-carbook (ADR 0014).                                              ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- `pgcrypto` pour `gen_random_bytes` et `digest` (jetons d'invitation, 0009).
-- Sur Supabase il vit dans le schéma `extensions` ; les fonctions qui s'en
-- servent le nomment explicitement.
create extension if not exists pgcrypto with schema extensions;

create type space_role as enum ('owner', 'admin', 'contributor', 'reader');

-- ════════════════════════════════════════════════════════════════════════════
-- Version et horodatage — le compteur d'édition concurrente
-- ════════════════════════════════════════════════════════════════════════════

-- Une écriture directe (`update … where version = N`) qui ne touche aucune
-- ligne a perdu la course : le client le sait par le nombre de lignes, et
-- relit. C'est la résolution de conflit de l'ADR 0015 — explicite, jamais
-- une fusion.
create or replace function bump_version() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.version = old.version + 1;
  new.updated_at = now();
  return new;
end;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- Espaces
-- ════════════════════════════════════════════════════════════════════════════

create table expense_spaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  description text not null default '' check (char_length(description) <= 500),
  -- ISO 4217, et le nombre de décimales de la devise : c'est lui qui borne
  -- l'échelle de tous les montants de l'espace (ADR 0011).
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  minor_unit smallint not null default 2 check (minor_unit between 0 and 3),
  icon text not null default '' check (char_length(icon) <= 8),
  color text not null default '' check (color = '' or color ~ '^#[0-9a-fA-F]{6}$'),
  archived_at timestamptz,
  version integer not null default 1,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table expense_spaces enable row level security;

create trigger expense_spaces_bump_version
  before update on expense_spaces
  for each row execute function bump_version();

-- ════════════════════════════════════════════════════════════════════════════
-- Adhésions — un compte, un espace, un rôle
-- ════════════════════════════════════════════════════════════════════════════

create table space_memberships (
  space_id uuid not null references expense_spaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role space_role not null default 'contributor',
  invited_by uuid references auth.users (id) on delete set null,
  joined_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (space_id, user_id)
);

alter table space_memberships enable row level security;

-- UN SEUL PROPRIÉTAIRE. L'index unique partiel est la seule source de vérité :
-- pas de colonne `owner_id` à côté, qui finirait par diverger.
create unique index space_memberships_one_owner
  on space_memberships (space_id) where role = 'owner';

create index space_memberships_user_idx on space_memberships (user_id);

create trigger space_memberships_touch_updated_at
  before update on space_memberships
  for each row execute function touch_updated_at();

-- ════════════════════════════════════════════════════════════════════════════
-- Fonctions d'appartenance — appelées par les politiques
-- ════════════════════════════════════════════════════════════════════════════

create or replace function space_role(p_space uuid) returns space_role
language sql stable security definer set search_path = public as $$
  select role from space_memberships
   where space_id = p_space and user_id = auth.uid();
$$;

create or replace function is_space_member(p_space uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select space_role(p_space) is not null;
$$;

-- JAMAIS NULL. Pour un non-membre, `space_role` rend NULL, et `NULL in (…)`
-- rend NULL : une politique le lit comme faux, mais `if not NULL` dans une
-- fonction ne lève JAMAIS — c'est ainsi qu'un compte étranger a pu appeler
-- `save_expense` lors de la première exécution de `espaces.test.sql`. D'où le
-- `coalesce` : ces fonctions répondent vrai ou faux, rien d'autre.
create or replace function can_contribute(p_space uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(space_role(p_space) in ('owner', 'admin', 'contributor'), false);
$$;

create or replace function is_space_admin(p_space uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(space_role(p_space) in ('owner', 'admin'), false);
$$;

create or replace function is_space_owner(p_space uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(space_role(p_space) = 'owner', false);
$$;

-- Les politiques s'exécutent sous le rôle de la requête : il lui faut le
-- droit d'appeler ces fonctions. `anon` ne l'a pas — il n'a aucune politique
-- qui en ait besoin.
revoke execute on function space_role(uuid), is_space_member(uuid),
  can_contribute(uuid), is_space_admin(uuid), is_space_owner(uuid)
  from public, anon;
grant execute on function space_role(uuid), is_space_member(uuid),
  can_contribute(uuid), is_space_admin(uuid), is_space_owner(uuid)
  to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- Gardes sur les espaces et les adhésions
-- ════════════════════════════════════════════════════════════════════════════

-- Archiver ou réactiver un espace est un geste de PROPRIÉTAIRE, alors que la
-- politique d'écriture est celle des administrateurs : le déclencheur fait
-- la différence. Une session sans compte (`auth.uid()` nul : migration,
-- `service_role`) n'est pas concernée — elle traverse la RLS de toute façon.
create or replace function expense_spaces_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if new.archived_at is distinct from old.archived_at
     and not is_space_owner(old.id) then
    raise exception 'seul le propriétaire archive ou réactive un espace'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger expense_spaces_guard
  before update on expense_spaces
  for each row execute function expense_spaces_guard();

-- LA PROPRIÉTÉ NE SE MODIFIE PAS PAR UNE ÉCRITURE DIRECTE. Ni promouvoir
-- quelqu'un `owner`, ni rétrograder ou retirer le propriétaire : c'est
-- `transfer_space_ownership` (0009) qui le fait, atomiquement, et elle lève
-- le drapeau de session `settle.transfer` que ce garde reconnaît.
create or replace function space_memberships_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null
     or current_setting('settle.transfer', true) = 'on' then
    return coalesce(new, old);
  end if;
  if tg_op = 'UPDATE' and (old.role = 'owner' or new.role = 'owner') then
    raise exception 'la propriété se transfère par transfer_space_ownership'
      using errcode = '42501';
  end if;
  -- LA CASCADE N'EST PAS UN DÉPART. Quand le propriétaire supprime l'espace,
  -- la clé étrangère efface ses adhésions après lui : l'espace n'existe déjà
  -- plus, et ce garde n'a rien à retenir.
  if tg_op = 'DELETE' and old.role = 'owner'
     and exists (select 1 from expense_spaces where id = old.space_id) then
    raise exception 'le propriétaire ne quitte pas son espace : transférer d''abord'
      using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger space_memberships_guard
  before update or delete on space_memberships
  for each row execute function space_memberships_guard();

-- ════════════════════════════════════════════════════════════════════════════
-- Personnes — l'unité comptable
-- ════════════════════════════════════════════════════════════════════════════

create table participants (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references expense_spaces (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 60),
  initials text not null default '' check (char_length(initials) <= 3),
  avatar_color text not null default ''
    check (avatar_color = '' or avatar_color ~ '^#[0-9a-fA-F]{6}$'),
  -- Facultatif, et jamais rendu à qui n'administre pas l'espace (vue 0008).
  email text check (email is null or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  -- L'ORDRE STABLE de l'espace : c'est lui qui décide à qui va le centime
  -- en trop (ADR 0011, `split.ts` et `settle_split`).
  position integer not null default 0,
  archived_at timestamptz,
  version integer not null default 1,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table participants enable row level security;

create unique index participants_name_unique
  on participants (space_id, lower(display_name)) where archived_at is null;
create index participants_space_order_idx on participants (space_id, position, id);

create trigger participants_bump_version
  before update on participants
  for each row execute function bump_version();

-- ════════════════════════════════════════════════════════════════════════════
-- Rattachements — une personne, un compte, historisé
-- ════════════════════════════════════════════════════════════════════════════

create table participant_user_links (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references participants (id) on delete cascade,
  -- Le compte parti emporte son rattachement ; la personne reste, avec son
  -- historique : c'est toute la raison d'être de la séparation.
  user_id uuid not null references auth.users (id) on delete cascade,
  linked_at timestamptz not null default now(),
  linked_by uuid references auth.users (id) on delete set null,
  unlinked_at timestamptz
);

alter table participant_user_links enable row level security;

create unique index participant_user_links_active_participant
  on participant_user_links (participant_id) where unlinked_at is null;
create index participant_user_links_user_idx
  on participant_user_links (user_id) where unlinked_at is null;

-- UN COMPTE, UNE PERSONNE PAR ESPACE. L'index unique ne sait pas remonter à
-- l'espace ; ce garde, si.
create or replace function participant_user_links_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_space uuid;
begin
  if new.unlinked_at is not null then return new; end if;
  select space_id into v_space from participants where id = new.participant_id;
  if exists (
    select 1
      from participant_user_links l
      join participants p on p.id = l.participant_id
     where l.user_id = new.user_id
       and p.space_id = v_space
       and l.unlinked_at is null
       and l.id <> new.id
  ) then
    raise exception 'ce compte est déjà rattaché à une personne de cet espace'
      using errcode = '23505';
  end if;
  return new;
end;
$$;

create trigger participant_user_links_guard
  before insert or update on participant_user_links
  for each row execute function participant_user_links_guard();

-- Un compte qui quitte l'espace (ou en est retiré) n'y est plus rattaché à
-- personne. La personne, elle, reste.
create or replace function space_memberships_unlink() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update participant_user_links l
     set unlinked_at = now()
    from participants p
   where p.id = l.participant_id
     and p.space_id = old.space_id
     and l.user_id = old.user_id
     and l.unlinked_at is null;
  return old;
end;
$$;

create trigger space_memberships_unlink
  after delete on space_memberships
  for each row execute function space_memberships_unlink();

-- ════════════════════════════════════════════════════════════════════════════
-- Regroupements — un raccourci, jamais un compte
-- ════════════════════════════════════════════════════════════════════════════

create table participant_groups (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references expense_spaces (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  color text not null default '' check (color = '' or color ~ '^#[0-9a-fA-F]{6}$'),
  archived_at timestamptz,
  version integer not null default 1,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table participant_groups enable row level security;

create unique index participant_groups_name_unique
  on participant_groups (space_id, lower(name)) where archived_at is null;

create trigger participant_groups_bump_version
  before update on participant_groups
  for each row execute function bump_version();

create table participant_group_members (
  group_id uuid not null references participant_groups (id) on delete cascade,
  participant_id uuid not null references participants (id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (group_id, participant_id)
);

alter table participant_group_members enable row level security;

create or replace function participant_group_members_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select space_id from participant_groups where id = new.group_id)
     is distinct from
     (select space_id from participants where id = new.participant_id) then
    raise exception 'regroupement et personne de deux espaces différents'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger participant_group_members_guard
  before insert or update on participant_group_members
  for each row execute function participant_group_members_guard();

-- ════════════════════════════════════════════════════════════════════════════
-- Catégories — un catalogue commun (`space_id` nul), puis celles de l'espace
-- ════════════════════════════════════════════════════════════════════════════

create table categories (
  id uuid primary key default gen_random_uuid(),
  space_id uuid references expense_spaces (id) on delete cascade,
  parent_id uuid references categories (id) on delete cascade,
  -- Clé stable du catalogue commun, traduite côté client ; nulle pour une
  -- catégorie créée dans un espace.
  key text check (key is null or key ~ '^[a-z][a-z0-9-]{1,30}$'),
  name text not null check (char_length(name) between 1 and 60),
  icon text not null default '' check (char_length(icon) <= 40),
  position integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table categories enable row level security;

create unique index categories_name_unique on categories (
  coalesce(space_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
  lower(name)
) where archived_at is null;

create trigger categories_touch_updated_at
  before update on categories
  for each row execute function touch_updated_at();

-- Profondeur 1 (catégorie → sous-catégorie), et une sous-catégorie vit dans
-- le même espace que sa catégorie.
create or replace function categories_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_parent categories%rowtype;
begin
  if new.parent_id is not null then
    select * into v_parent from categories where id = new.parent_id;
    if v_parent.parent_id is not null then
      raise exception 'une sous-catégorie n''a pas de sous-catégorie'
        using errcode = '23514';
    end if;
    if v_parent.space_id is distinct from new.space_id then
      raise exception 'sous-catégorie et catégorie de deux espaces différents'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger categories_guard
  before insert or update on categories
  for each row execute function categories_guard();

-- Le catalogue commun. Les noms sont français par défaut ; le client traduit
-- par la clé. Identifiants figés : un export CSV les cite.
insert into categories (id, key, name, icon, position) values
  ('a0000000-0000-4000-8000-000000000001', 'logement',   'Logement',    'house',        1),
  ('a0000000-0000-4000-8000-000000000002', 'transport',  'Transport',   'car',          2),
  ('a0000000-0000-4000-8000-000000000003', 'courses',    'Courses',     'shopping-cart',3),
  ('a0000000-0000-4000-8000-000000000004', 'restaurant', 'Restaurant',  'utensils',     4),
  ('a0000000-0000-4000-8000-000000000005', 'loisirs',    'Loisirs',     'ticket',       5),
  ('a0000000-0000-4000-8000-000000000006', 'sante',      'Santé',       'heart-pulse',  6),
  ('a0000000-0000-4000-8000-000000000007', 'cadeaux',    'Cadeaux',     'gift',         7),
  ('a0000000-0000-4000-8000-000000000008', 'autre',      'Autre',       'tag',          8);
