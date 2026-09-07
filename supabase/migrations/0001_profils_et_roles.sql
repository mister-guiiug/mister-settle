-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Profils et rôles — le socle relationnel de toute application de la       ║
-- ║ famille qui a des comptes.                                               ║
-- ║                                                                          ║
-- ║ POURQUOI ICI. Trois dépôts du parc (bac-sable, miss-carbook, mister-doc) ║
-- ║ portent chacun leur version de `profiles` + `handle_new_user` +          ║
-- ║ `touch_updated_at` + `is_admin`. Le paquet npm ne peut pas les livrer :  ║
-- ║ il ne franchit ni Deno ni Postgres. Un squelette, si — et c'est le seul  ║
-- ║ moment où ces fichiers ont de la valeur, puisqu'ils ne se migrent pas    ║
-- ║ après coup.                                                              ║
-- ║                                                                          ║
-- ║ LES TABLES NAISSENT VERROUILLÉES. `enable row level security` est posé   ║
-- ║ ici, et AUCUNE politique n'est créée avant `0003_rls.sql`. Un schéma     ║
-- ║ poussé à moitié refuse donc tout, au lieu d'exposer. C'est l'inverse du  ║
-- ║ défaut : une table sans RLS est lisible par quiconque a la clé anon,     ║
-- ║ qui est publique par construction.                                       ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ════════════════════════════════════════════════════════════════════════════
-- Horodatage — une seule fonction pour toutes les tables
-- ════════════════════════════════════════════════════════════════════════════

-- `search_path` FIGÉ. Sans lui, un schéma temporaire placé devant `public`
-- détournerait les noms résolus à l'intérieur de la fonction. C'est vrai de
-- toute fonction `security definer`, et bon marché partout ailleurs.
create or replace function touch_updated_at() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- Profils — ce que l'application sait d'un compte
-- ════════════════════════════════════════════════════════════════════════════

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table profiles enable row level security;

create trigger profiles_touch_updated_at
  before update on profiles
  for each row execute function touch_updated_at();

-- Le profil naît AVEC le compte, dans la même transaction que l'inscription.
-- Le créer depuis le client laisserait une fenêtre où un utilisateur existe
-- sans profil — et c'est toujours dans cette fenêtre que l'application plante.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    -- `raw_user_meta_data` est ce que le client a envoyé : il n'est pas de
    -- confiance, d'où la coupe à 80 caractères et le repli sur l'adresse.
    coalesce(
      left(nullif(new.raw_user_meta_data ->> 'display_name', ''), 80),
      split_part(new.email, '@', 1)
    )
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ════════════════════════════════════════════════════════════════════════════
-- Rôles applicatifs
-- ════════════════════════════════════════════════════════════════════════════

create type app_role as enum ('admin');

-- TABLE NON ÉCRIVABLE PAR L'API : aucune politique d'insertion ni de mise à
-- jour n'est créée dans `0003_rls.sql`. Se donner un rôle à soi-même depuis le
-- navigateur est donc impossible, quelle que soit la clé utilisée. Les rôles
-- se posent par la clé `service_role`, qui ne quitte jamais le serveur.
create table user_roles (
  user_id uuid not null references auth.users (id) on delete cascade,
  role app_role not null,
  granted_at timestamptz not null default now(),
  granted_by uuid references auth.users (id) on delete set null,
  primary key (user_id, role)
);

alter table user_roles enable row level security;

-- `security definer` : la fonction doit voir toute la table alors que
-- l'appelant n'y verra que ses propres lignes. `stable` permet au planificateur
-- de ne l'évaluer qu'une fois par requête, ce qui compte quand elle est
-- appelée depuis une politique.
create or replace function has_role(wanted app_role) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from user_roles
    where user_id = auth.uid() and role = wanted
  );
$$;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select has_role('admin');
$$;
