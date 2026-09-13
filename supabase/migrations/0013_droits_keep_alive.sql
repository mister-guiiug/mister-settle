-- Mister Settle — 0013 — les privilèges de table de `keep_alive`.
--
-- POURQUOI UNE MIGRATION DE PLUS, ALORS QUE `0012` FAIT DÉJÀ CE QU'IL FAUT.
-- `0012` crée la table, active la RLS et donne à `anon` une policy `select`.
-- C'est correct, et ce n'est qu'une moitié : une policy filtre des LIGNES, un
-- privilège de table autorise la COMMANDE. Les deux existent, et ils tombent
-- pour des raisons indépendantes.
--
-- `0012` est la SEULE table de ce dépôt à ne pas régler la seconde moitié.
-- `0003_rls.sql` et `0008_rls_espaces.sql` reprennent systématiquement tout
-- (`revoke all … from anon, authenticated`) avant de rendre verbe par verbe ce
-- dont l'application a besoin. Cette migration met `keep_alive` au même régime,
-- plutôt que d'en faire l'exception qu'on redécouvrira dans six mois.
--
-- CE QUE ÇA CHANGE CONCRÈTEMENT. Sur un projet Supabase, une table neuve de
-- `public` arrive avec INSERT, UPDATE, DELETE **et TRUNCATE** déjà accordés à
-- `anon` et `authenticated` (relevé le 13/09/2026 sur un projet du parc).
-- Seule la RLS les arrête — et elle ne les arrête pas tous : vérifié le même
-- jour, avec la RLS active et une unique policy `select`, un `truncate` passé
-- en rôle `anon` a VIDÉ la table sans rien violer. La RLS ne couvre pas
-- `truncate`, le privilège si.
--
-- Ce n'est pas une faille exploitable en l'état : PostgREST n'expose pas
-- `truncate`, et `anon` n'est pas un rôle de connexion. C'est une dépendance
-- cachée — aujourd'hui rien ne protège cette table qu'un `alter table … disable
-- row level security` fait un jour par commodité. Après ces deux lignes, il
-- faut défaire DEUX choses au lieu d'une.
--
-- Rejouable sans effet de bord.

revoke all on table public.keep_alive from anon, authenticated;

-- Le ping anti-pause ne fait qu'un `select … limit 1` : c'est tout ce qu'on lui
-- rend, et à lui seul. `service_role` garde ses droits — c'est la voie
-- d'administration, et elle passe de toute façon outre la RLS.
grant select on table public.keep_alive to anon;
