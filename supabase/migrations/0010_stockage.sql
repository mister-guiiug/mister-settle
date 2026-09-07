-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Les justificatifs — le bucket privé et ses politiques.                   ║
-- ║                                                                          ║
-- ║ Le bucket `receipts` est PRIVÉ : rien ne se lit sans URL signée, et une  ║
-- ║ URL signée ne s'obtient qu'avec une session que les politiques           ║
-- ║ ci-dessous acceptent en lecture. Le chemin d'un objet commence par       ║
-- ║ l'identifiant de l'espace (`0007`, `attachments_path_in_space`) : c'est  ║
-- ║ ce préfixe que les politiques lisent, avec les MÊMES fonctions           ║
-- ║ d'appartenance que le reste du schéma (0006).                            ║
-- ║                                                                          ║
-- ║ La suppression est ouverte aux contributeurs de l'espace : c'est la      ║
-- ║ ligne `attachments` (auteur ou administrateur, 0008) qui décide, et      ║
-- ║ l'adaptateur la retire AVANT l'objet — un refus ne laisse aucun fichier  ║
-- ║ orphelin.                                                                ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'receipts', 'receipts', false, 5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- L'espace d'un objet, lu dans son chemin ; `null` si le chemin n'en porte
-- pas — et une politique qui reçoit `null` refuse.
create or replace function settle_path_space(p_name text) returns uuid
language plpgsql immutable as $$
begin
  return split_part(p_name, '/', 1)::uuid;
exception when others then
  return null;
end;
$$;
revoke execute on function settle_path_space(text) from public, anon;
grant execute on function settle_path_space(text) to authenticated;

drop policy if exists receipts_select on storage.objects;
create policy receipts_select on storage.objects
  for select to authenticated
  using (bucket_id = 'receipts' and is_space_member(settle_path_space(name)));

drop policy if exists receipts_insert on storage.objects;
create policy receipts_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'receipts' and can_contribute(settle_path_space(name)));

drop policy if exists receipts_delete on storage.objects;
create policy receipts_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'receipts' and can_contribute(settle_path_space(name)));
