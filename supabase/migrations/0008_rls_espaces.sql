-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Row Level Security des espaces — ce qui ouvre, et rien de plus.          ║
-- ║                                                                          ║
-- ║ Les tables de 0006 et 0007 sont verrouillées depuis leur naissance. Ce   ║
-- ║ fichier ouvre le strict nécessaire, avec le double verrou de 0003 :      ║
-- ║ droits SQL retirés puis redonnés un par un, EN PLUS des politiques.      ║
-- ║                                                                          ║
-- ║ LA RÈGLE, EN UNE LIGNE PAR RÔLE (ADR 0014) : `reader` lit ;              ║
-- ║ `contributor` écrit dépenses, remboursements et justificatifs ; `admin`  ║
-- ║ gère personnes, regroupements, catégories, invitations et réglages ;     ║
-- ║ `owner` archive, supprime, transfère.                                    ║
-- ║                                                                          ║
-- ║ CE QUI N'A AUCUN GRANT D'ÉCRITURE, POUR PERSONNE : `expenses` et ses     ║
-- ║ lignes, `expense_allocations`, `expense_group_snapshots`,                ║
-- ║ `expense_revisions`, `participant_user_links`, `activity_logs`, et       ║
-- ║ l'insertion dans `space_memberships` et `invitations`. Tout cela passe   ║
-- ║ par les fonctions de 0009, qui recalculent, vérifient et journalisent.   ║
-- ║ Une politique ne saurait pas dire « la somme des parts est le montant » ; ║
-- ║ une fonction, si.                                                        ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Premier verrou : les droits SQL
-- ════════════════════════════════════════════════════════════════════════════

revoke all on expense_spaces, space_memberships, participants,
  participant_user_links, participant_groups, participant_group_members,
  categories, expenses, expense_payers, expense_beneficiaries,
  expense_allocations, expense_group_snapshots, expense_revisions,
  settlements, attachments, invitations, activity_logs
  from anon, authenticated;

grant select, update, delete on expense_spaces to authenticated;
grant select, update, delete on space_memberships to authenticated;
grant select, insert, update, delete on participants to authenticated;
grant select on participant_user_links to authenticated;
grant select, insert, update, delete on participant_groups to authenticated;
grant select, insert, delete on participant_group_members to authenticated;
grant select, insert, update, delete on categories to authenticated;
grant select, delete on expenses to authenticated;
grant select on expense_payers, expense_beneficiaries, expense_allocations,
  expense_group_snapshots, expense_revisions to authenticated;
grant select, insert, update, delete on settlements to authenticated;
grant select, insert, delete on attachments to authenticated;
grant select, update, delete on invitations to authenticated;
grant select on activity_logs to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Second verrou : les politiques
-- ════════════════════════════════════════════════════════════════════════════

-- Espaces.
create policy expense_spaces_select on expense_spaces
  for select to authenticated
  using (is_space_member(id));
create policy expense_spaces_update on expense_spaces
  for update to authenticated
  using (is_space_admin(id))
  with check (is_space_admin(id));
create policy expense_spaces_delete on expense_spaces
  for delete to authenticated
  using (is_space_owner(id));
-- Aucune politique d'INSERT : un espace naît par `create_space`, avec son
-- propriétaire et sa première personne, dans une seule transaction.

-- Adhésions. L'insertion passe par `create_space` et `accept_invitation`.
create policy space_memberships_select on space_memberships
  for select to authenticated
  using (is_space_member(space_id));
create policy space_memberships_update on space_memberships
  for update to authenticated
  using (is_space_admin(space_id))
  with check (is_space_admin(space_id) and role <> 'owner');
create policy space_memberships_delete on space_memberships
  for delete to authenticated
  using (
    role <> 'owner'
    and (is_space_admin(space_id) or user_id = auth.uid())
  );

-- Personnes.
create policy participants_select on participants
  for select to authenticated
  using (is_space_member(space_id));
create policy participants_insert on participants
  for insert to authenticated
  with check (is_space_admin(space_id));
create policy participants_update on participants
  for update to authenticated
  using (is_space_admin(space_id))
  with check (is_space_admin(space_id));
create policy participants_delete on participants
  for delete to authenticated
  using (is_space_admin(space_id));

-- L'e-mail d'une personne n'est rendu qu'aux administrateurs. La table le
-- porte ; les autres membres lisent cette vue, qui le masque. Une vue
-- `security_invoker` applique la RLS de la table sous le rôle de l'appelant.
create view participants_public with (security_invoker = true) as
  select id, space_id, display_name, initials, avatar_color, position,
         archived_at, version, created_at, updated_at,
         case when is_space_admin(space_id) then email end as email
    from participants;
grant select on participants_public to authenticated;

-- Rattachements : lisibles des membres, écrits par les fonctions seulement.
create policy participant_user_links_select on participant_user_links
  for select to authenticated
  using (exists (
    select 1 from participants p
     where p.id = participant_id and is_space_member(p.space_id)
  ));

-- Regroupements.
create policy participant_groups_select on participant_groups
  for select to authenticated
  using (is_space_member(space_id));
create policy participant_groups_insert on participant_groups
  for insert to authenticated
  with check (is_space_admin(space_id));
create policy participant_groups_update on participant_groups
  for update to authenticated
  using (is_space_admin(space_id))
  with check (is_space_admin(space_id));
create policy participant_groups_delete on participant_groups
  for delete to authenticated
  using (is_space_admin(space_id));

create policy participant_group_members_select on participant_group_members
  for select to authenticated
  using (exists (
    select 1 from participant_groups g
     where g.id = group_id and is_space_member(g.space_id)
  ));
create policy participant_group_members_insert on participant_group_members
  for insert to authenticated
  with check (exists (
    select 1 from participant_groups g
     where g.id = group_id and is_space_admin(g.space_id)
  ));
create policy participant_group_members_delete on participant_group_members
  for delete to authenticated
  using (exists (
    select 1 from participant_groups g
     where g.id = group_id and is_space_admin(g.space_id)
  ));

-- Catégories : le catalogue commun pour tout compte, celles de l'espace pour
-- ses membres ; seul un administrateur écrit, et seulement dans son espace.
create policy categories_select on categories
  for select to authenticated
  using (space_id is null or is_space_member(space_id));
create policy categories_insert on categories
  for insert to authenticated
  with check (space_id is not null and is_space_admin(space_id));
create policy categories_update on categories
  for update to authenticated
  using (space_id is not null and is_space_admin(space_id))
  with check (space_id is not null and is_space_admin(space_id));
create policy categories_delete on categories
  for delete to authenticated
  using (space_id is not null and is_space_admin(space_id));

-- Dépenses : lecture par les membres ; suppression physique par un
-- administrateur, sur un BROUILLON seulement — une dépense validée s'archive.
-- L'écriture passe par `save_expense` / `validate_expense` / `archive_expense`.
create policy expenses_select on expenses
  for select to authenticated
  using (is_space_member(space_id));
create policy expenses_delete on expenses
  for delete to authenticated
  using (is_space_admin(space_id) and status = 'draft');

create policy expense_payers_select on expense_payers
  for select to authenticated
  using (exists (
    select 1 from expenses e where e.id = expense_id and is_space_member(e.space_id)
  ));
create policy expense_beneficiaries_select on expense_beneficiaries
  for select to authenticated
  using (exists (
    select 1 from expenses e where e.id = expense_id and is_space_member(e.space_id)
  ));
create policy expense_allocations_select on expense_allocations
  for select to authenticated
  using (exists (
    select 1 from expenses e where e.id = expense_id and is_space_member(e.space_id)
  ));
create policy expense_group_snapshots_select on expense_group_snapshots
  for select to authenticated
  using (exists (
    select 1 from expenses e where e.id = expense_id and is_space_member(e.space_id)
  ));
create policy expense_revisions_select on expense_revisions
  for select to authenticated
  using (exists (
    select 1 from expenses e where e.id = expense_id and is_space_member(e.space_id)
  ));

-- Remboursements déclarés : un contributeur en déclare et en annule ; l'auteur
-- est VÉRIFIÉ, pas écrit par le client.
create policy settlements_select on settlements
  for select to authenticated
  using (is_space_member(space_id));
create policy settlements_insert on settlements
  for insert to authenticated
  with check (can_contribute(space_id) and created_by = auth.uid());
create policy settlements_update on settlements
  for update to authenticated
  using (can_contribute(space_id))
  with check (can_contribute(space_id));
create policy settlements_delete on settlements
  for delete to authenticated
  using (is_space_admin(space_id));

-- Justificatifs.
create policy attachments_select on attachments
  for select to authenticated
  using (is_space_member(space_id));
create policy attachments_insert on attachments
  for insert to authenticated
  with check (can_contribute(space_id) and created_by = auth.uid());
create policy attachments_delete on attachments
  for delete to authenticated
  using (created_by = auth.uid() or is_space_admin(space_id));

-- Invitations : les administrateurs les voient, les révoquent, les retirent.
-- Leur création rend le jeton une fois (`create_invitation`) ; leur
-- acceptation ne lit jamais la table depuis le client (`accept_invitation`).
create policy invitations_select on invitations
  for select to authenticated
  using (is_space_admin(space_id));
create policy invitations_update on invitations
  for update to authenticated
  using (is_space_admin(space_id))
  with check (is_space_admin(space_id));
create policy invitations_delete on invitations
  for delete to authenticated
  using (is_space_admin(space_id));

-- Journal : lisible des membres, écrit par la base.
create policy activity_logs_select on activity_logs
  for select to authenticated
  using (is_space_member(space_id));

-- Les membres d'un même espace se voient — le nom d'affichage, c'est tout ce
-- que `profiles` porte. Deux politiques permissives se combinent par OU avec
-- `profiles_select_self` (0003).
create policy profiles_select_shared on profiles
  for select to authenticated
  using (exists (
    select 1
      from space_memberships mine
      join space_memberships theirs on theirs.space_id = mine.space_id
     where mine.user_id = auth.uid()
       and theirs.user_id = profiles.id
  ));
