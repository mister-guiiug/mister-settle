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
-- ║                                                                          ║
-- ║ CE QUE LA CASCADE A APPRIS À LA PILE JETABLE. Effacer `auth.users`       ║
-- ║ réécrit, par clé étrangère, tout ce que le compte avait de sa main : les ║
-- ║ adhésions qu'il a invitées (`invited_by`), les personnes, regroupements  ║
-- ║ et remboursements qu'il a créés. Trois déclencheurs de 0006 et 0007 s'y  ║
-- ║ opposaient sans le vouloir : le garde des adhésions (une ligne `owner`   ║
-- ║ ne se touche pas hors transfert — mais un `invited_by` n'est pas un      ║
-- ║ transfert), le garde des remboursements (l'auteur ne change pas — mais   ║
-- ║ ici il n'existe plus), et le journal, qui nommait pour acteur un compte  ║
-- ║ déjà effacé (23503) et aurait dit « modifié » de chaque ligne dont       ║
-- ║ l'auteur venait de passer à null. Ils sont précisés ci-dessous, sans     ║
-- ║ drapeau nouveau : chacun regarde ce qui a réellement changé.            ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ── Le journal ────────────────────────────────────────────────────────────

-- L'ACTEUR EST LE COMPTE S'IL EXISTE ENCORE, sinon personne. Pendant la
-- suppression d'un compte, la cascade écrit encore au journal alors que la
-- ligne de `auth.users` n'est déjà plus là : la nommer ferait échouer la
-- cascade, et la clé étrangère l'aurait de toute façon passée à null.
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
  values (p_space,
          (select id from auth.users where id = auth.uid()),
          p_entity, p_entity_id, p_action,
          jsonb_strip_nulls(coalesce(p_payload, '{}'::jsonb)));
end;
$$;

-- UN AUTEUR QUI S'EN VA N'EST PAS UN ÉVÉNEMENT SUR LA LIGNE. Une mise à jour
-- qui ne touche que les colonnes d'auteur — et `version`, `updated_at`, qui
-- suivent toute écriture sans rien dire par elles-mêmes — ne laisse pas de
-- trace : c'est la cascade d'un compte supprimé, pas un geste de quelqu'un.
create or replace function activity_trigger() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  quiet constant text[] := array[
    'created_by', 'invited_by', 'linked_by', 'validated_by', 'version', 'updated_at'
  ];
  rec jsonb;
  v_id uuid;
begin
  if tg_op = 'UPDATE' and (to_jsonb(new) - quiet) = (to_jsonb(old) - quiet) then
    return new;
  end if;
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

-- ── Les remboursements ───────────────────────────────────────────────────

-- L'AUTEUR NE SE RÉÉCRIT PAS ; IL PEUT SEULEMENT DISPARAÎTRE, avec son
-- compte. Tant que le compte existe, sa signature reste ; un contributeur
-- ne l'efface pas plus qu'il ne la remplace.
create or replace function settlements_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select space_id from participants where id = new.from_participant_id) <> new.space_id
     or (select space_id from participants where id = new.to_participant_id) <> new.space_id then
    raise exception 'remboursement entre personnes d''un autre espace'
      using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and new.created_by is distinct from old.created_by
     and (new.created_by is not null
          or exists (select 1 from auth.users where id = old.created_by)) then
    raise exception 'l''auteur d''un remboursement ne change pas'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- ── Le départ ────────────────────────────────────────────────────────────

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

  -- LE COMPTE PART : le garde des adhésions n'a rien à retenir de ce qui
  -- suit. Les transmissions sont décidées ici, et la cascade de `auth.users`
  -- passera `invited_by` à null sur les adhésions qu'il avait invitées —
  -- celle d'un propriétaire aussi — ce qui n'est pas un transfert.
  perform set_config('settle.transfer', 'on', true);

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
      update space_memberships set role = 'admin'
       where space_id = owned.space_id and user_id = uid;
      update space_memberships set role = 'owner'
       where space_id = owned.space_id and user_id = heir;
      perform log_activity(owned.space_id, 'space_memberships', heir,
                           'transfer', '{}'::jsonb);
    end if;
  end loop;

  -- QUITTER CHAQUE ESPACE, explicitement et avant le compte : le journal note
  -- le départ, le rattachement se dénoue (0006), et la cascade n'a plus
  -- d'adhésion à retirer.
  delete from space_memberships where user_id = uid;

  delete from public.user_roles where user_id = uid;
  delete from public.profiles where id = uid;
  delete from auth.users where id = uid;

  perform set_config('settle.transfer', 'off', true);
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
