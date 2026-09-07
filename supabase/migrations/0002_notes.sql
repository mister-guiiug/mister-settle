-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Les notes — la table de la fonctionnalité d'exemple.                     ║
-- ║                                                                          ║
-- ║ Elle est faite pour être SUPPRIMÉE, comme `src/features/home/`. Ce       ║
-- ║ qu'elle montre et qui doit rester : une table possédée par un            ║
-- ║ utilisateur, verrouillée dès sa naissance, dont l'identifiant est celui  ║
-- ║ que le client a produit.                                                 ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

create table notes (
  -- `text` et non `uuid` : l'identifiant vient de `createId('note')` du socle,
  -- qui produit une chaîne préfixée lisible. Un `uuid` obligerait le client à
  -- en générer un, ce qu'il sait faire — mais alors le préfixe se perd, et
  -- avec lui la capacité de reconnaître un identifiant dans un journal.
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  text text not null check (char_length(text) between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table notes enable row level security;

create trigger notes_touch_updated_at
  before update on notes
  for each row execute function touch_updated_at();

-- La lecture d'un utilisateur porte toujours sur SES notes, triées par date.
-- Sans cet index, chaque lecture balaie la table entière — invisible à dix
-- lignes, sensible à dix mille.
create index notes_user_created_idx on notes (user_id, created_at desc);
