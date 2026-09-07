-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Supprimer son compte, quand on a des espaces — l'ANONYMISATION (H11).    ║
-- ║                                                                          ║
-- ║ La personne reste dans ses espaces : ses dépenses appartiennent aux      ║
-- ║ autres membres, ses soldes restent vrais. Ce qui disparaît : le lien     ║
-- ║ entre la personne et le compte (cascade de `participant_user_links`),    ║
-- ║ l'adhésion, le profil, le compte. Les colonnes d'auteur passent à `null` ║
-- ║ par leurs clés étrangères.                                               ║
-- ║                                                                          ║
-- ║ LE CAS DU PROPRIÉTAIRE : la cascade ne peut pas retirer une adhésion     ║
-- ║ `owner` tant que l'espace existe (garde de 0006). Avant de partir, le    ║
-- ║ compte TRANSMET chaque espace qu'il possède — à l'administrateur le plus ║
-- ║ ancien, sinon au membre le plus ancien — et SUPPRIME ceux où il était    ║
-- ║ seul : un espace sans personne pour le tenir n'a plus de raison d'être.  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  owned record;
  heir uuid;
begin
  if uid is null then
    raise exception 'suppression de compte sans session'
      using errcode = '42501';
  end if;

  for owned in
    select space_id from space_memberships
     where user_id = uid and role = 'owner'
  loop
    select user_id into heir from space_memberships
     where space_id = owned.space_id and user_id <> uid
     order by (role = 'admin') desc, joined_at asc, user_id asc
     limit 1;
    if heir is null then
      delete from expense_spaces where id = owned.space_id;
    else
      perform set_config('settle.transfer', 'on', true);
      update space_memberships set role = 'admin'
       where space_id = owned.space_id and user_id = uid;
      update space_memberships set role = 'owner'
       where space_id = owned.space_id and user_id = heir;
      perform set_config('settle.transfer', 'off', true);
      perform log_activity(owned.space_id, 'space_memberships', heir,
                           'transfer', '{}'::jsonb);
    end if;
  end loop;

  delete from public.user_roles where user_id = uid;
  delete from public.profiles where id = uid;
  delete from auth.users where id = uid;
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
