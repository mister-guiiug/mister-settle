-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Row Level Security des tables du squelette — ce qui ouvre, et rien de    ║
-- ║ plus.                                                                    ║
-- ║                                                                          ║
-- ║ `profiles` et `user_roles` sont en `enable row level security` depuis   ║
-- ║ 0001, et sans aucune politique : jusqu'ici elles ne répondaient à        ║
-- ║ personne. Ce fichier ouvre le strict nécessaire. Les tables de           ║
-- ║ l'application (espaces, dépenses…) naissent en 0006 et 0007, et leurs    ║
-- ║ politiques vivent en 0008 — même méthode, même double verrou.            ║
-- ║                                                                          ║
-- ║ TROIS PRINCIPES                                                          ║
-- ║                                                                          ║
-- ║  1. DEUX VERROUS, PAS UN. Les droits SQL (`grant`) sont retirés puis     ║
-- ║     redonnés un par un, EN PLUS des politiques. Une politique mal        ║
-- ║     écrite ne suffit alors pas à ouvrir une table : il faudrait aussi    ║
-- ║     s'être trompé de `grant`. C'est la seule protection qui survive à    ║
-- ║     une erreur de politique.                                             ║
-- ║                                                                          ║
-- ║  2. `anon` NE LIT RIEN. La clé anonyme est publique — elle est dans le   ║
-- ║     bundle servi par GitHub Pages. Ce qui protège la donnée est cette    ║
-- ║     absence de politique, jamais la discrétion de la clé.                ║
-- ║                                                                          ║
-- ║  3. Un identifiant de compte N'EST PAS ÉCRIT PAR LE CLIENT, il est       ║
-- ║     VÉRIFIÉ : le `with check` compare à `auth.uid()`.                    ║
-- ║                                                                          ║
-- ║ CE QU'ON NE FAIT PAS : `force row level security`. Sur Supabase, le rôle ║
-- ║ `postgres` porte `bypassrls` et n'est PAS superutilisateur : la          ║
-- ║ directive ne protégerait rien et casserait les migrations.               ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Premier verrou : les droits SQL
-- ════════════════════════════════════════════════════════════════════════════

revoke all on profiles from anon, authenticated;
revoke all on user_roles from anon, authenticated;

-- `anon` ne reçoit RIEN. Pas une lecture, pas une table.
grant select, update on profiles to authenticated;
grant select on user_roles to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Second verrou : les politiques
-- ════════════════════════════════════════════════════════════════════════════

-- Profils — chacun le sien ; un administrateur de l'application les voit
-- tous. 0008 ajoute une seconde politique de lecture : les membres d'un même
-- espace se voient (nom d'affichage seulement — l'e-mail n'est pas ici).
create policy profiles_select_self on profiles
  for select to authenticated
  using (id = auth.uid() or is_admin());

create policy profiles_update_self on profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Aucune politique d'INSERT : les profils naissent par le déclencheur
-- `handle_new_user`, jamais par une requête du client. Aucune de DELETE non
-- plus : un profil disparaît avec son compte, par la cascade.

-- Rôles — on voit les siens, et un administrateur voit tout. Aucune écriture,
-- pour personne : les rôles se posent par la clé `service_role`.
create policy user_roles_select_self on user_roles
  for select to authenticated
  using (user_id = auth.uid() or is_admin());
