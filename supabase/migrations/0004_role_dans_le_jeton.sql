-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Le rôle DANS le jeton — le hook « Custom Access Token ».                 ║
-- ║                                                                          ║
-- ║ L'ADR 0007 décide que `useRole()` lit le rôle dans le jeton, jamais dans ║
-- ║ une table interrogée depuis le navigateur. Jusqu'au 05/09/2026, RIEN ne  ║
-- ║ l'y écrivait : `0001` crée `user_roles` et `is_admin()`, pas un claim.   ║
-- ║ Le badge « admin » ne pouvait donc jamais s'afficher — et aucun test ne  ║
-- ║ le couvrait. Ce fichier apporte la pièce manquante.                      ║
-- ║                                                                          ║
-- ║ CE QUE FAIT LE HOOK. À chaque émission de jeton, GoTrue appelle cette    ║
-- ║ fonction avec l'évènement (`user_id`, `claims`) et reprend ce qu'elle    ║
-- ║ rend. Elle recopie les rôles de `user_roles` dans `app_metadata.roles`.  ║
-- ║ Le client ne lit donc qu'un jeton signé — la table reste inaccessible    ║
-- ║ en écriture, et sa lecture depuis le front n'est pas nécessaire.         ║
-- ║                                                                          ║
-- ║ IL DOIT ÊTRE ACTIVÉ, ET CE FICHIER NE PEUT PAS LE FAIRE. En local :      ║
-- ║ `[auth.hook.custom_access_token]` dans `supabase/config.toml`. Sur le    ║
-- ║ projet hébergé : tableau de bord (Authentication → Hooks) ou API de      ║
-- ║ gestion (`hook_custom_access_token_enabled`, `_uri`). Sans activation,  ║
-- ║ le jeton reste muet et le badge aussi — c'est le geste que le README    ║
-- ║ liste parmi ceux qu'une application Supabase doit faire à la main.      ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  claims jsonb;
  roles jsonb;
begin
  -- Toujours un tableau, même vide : un client qui lit `roles` ne doit pas
  -- avoir à distinguer « absent » de « aucun ».
  select coalesce(jsonb_agg(role::text order by role), '[]'::jsonb)
    into roles
    from public.user_roles
   where user_id = (event ->> 'user_id')::uuid;

  claims := coalesce(event -> 'claims', '{}'::jsonb);
  claims := jsonb_set(
    claims,
    '{app_metadata}',
    coalesce(claims -> 'app_metadata', '{}'::jsonb)
      || jsonb_build_object('roles', roles)
  );
  return jsonb_set(event, '{claims}', claims);
end;
$$;

-- Seul GoTrue (`supabase_auth_admin`) appelle le hook. Personne d'autre : un
-- appel depuis l'API donnerait à lire les rôles d'autrui par l'argument.
grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;

-- Le hook lit `user_roles` sous le rôle de GoTrue : droit SQL ET politique,
-- comme partout ailleurs (double verrou de 0003). Cette politique n'ouvre
-- rien à l'API : `supabase_auth_admin` n'est jamais le rôle d'une requête
-- PostgREST.
grant select on table public.user_roles to supabase_auth_admin;

create policy user_roles_select_auth_admin on public.user_roles
  as permissive for select
  to supabase_auth_admin
  using (true);
