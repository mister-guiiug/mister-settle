-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Supprimer son compte — le droit à l'effacement (RGPD art. 17), sans      ║
-- ║ écrire au mainteneur.                                                    ║
-- ║                                                                          ║
-- ║ RELEVÉ DU 06/09/2026. Huit applications du parc ont des comptes et       ║
-- ║ n'offrent aucune voie d'effacement : miss-uwh (`wipeLocal` ne purge que  ║
-- ║ le miroir local), mister-molkky, miss-lookhouse, mister-miss-koh         ║
-- ║ (« reste à faire »), miss-carbook (le README renvoie « au                ║
-- ║ fournisseur »), mister-footcoach, mister-qowa, miss-ticket-pwa. Deux     ║
-- ║ l'ont fait — mister-doc par anonymisation, mister-family-map par un      ║
-- ║ port. Et le squelette n'offrait que `signOut`.                           ║
-- ║                                                                          ║
-- ║ POURQUOI EFFACER, ET NON ANONYMISER. Mister-doc anonymise parce qu'il ne ║
-- ║ PEUT PAS effacer : les gardes passées d'un médecin sont rattachées à sa  ║
-- ║ fiche en `on delete cascade`, et supprimer la fiche détruirait le        ║
-- ║ planning de tout le service. C'est une contrainte de son métier, pas une ║
-- ║ doctrine. Ici, rien de ce que possède un compte n'appartient à quelqu'un ║
-- ║ d'autre : effacer est plus simple, plus vérifiable, et c'est ce que      ║
-- ║ l'article 17 demande. Une application dont les données survivent à leur  ║
-- ║ auteur doit anonymiser, et l'ÉCRIRE (cf. docs/adr/0009).                 ║
-- ║                                                                          ║
-- ║ CE QUI REND CETTE FONCTION POSSIBLE, et qui n'avait jamais été prouvé    ║
-- ║ sur ce parc : `security definer` la fait s'exécuter avec les droits de   ║
-- ║ son PROPRIÉTAIRE. Les migrations sont appliquées par `postgres`, qui     ║
-- ║ possède donc cette fonction et a le droit d'écrire dans `auth.users` —   ║
-- ║ ce que `authenticated`, lui, n'a à aucun moment. La preuve est dans      ║
-- ║ `supabase/tests/suppression-compte.test.sql`, jouée sur une pile jetable ║
-- ║ à chaque changement de migration : elle vérifie ET le résultat ET le     ║
-- ║ mécanisme (le propriétaire de la fonction, et son `security definer`).   ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
begin
  -- SANS SESSION, ON LÈVE. Écrire `where id = auth.uid()` avec un `uid` nul
  -- ne supprimerait rien ET ne dirait rien : la fonction rendrait « fait »
  -- sans avoir rien fait, ce qui est la pire réponse possible à cette
  -- demande-là. 42501 = `insufficient_privilege`, le même code que refuse la
  -- RLS ailleurs.
  if uid is null then
    raise exception 'suppression de compte sans session'
      using errcode = '42501';
  end if;

  -- LES DONNÉES DE L'APPLICATION, NOMMÉES UNE PAR UNE.
  --
  -- La cascade de `auth.users` les emporterait toutes : `profiles`, `notes`
  -- et `user_roles` référencent `auth.users (id) on delete cascade`. On les
  -- efface quand même explicitement, et c'est délibéré — le jour où une
  -- application ajoute une table en `on delete set null`, ou sans clé
  -- étrangère du tout (un compteur, un journal, une pièce jointe dans le
  -- stockage), la cascade ne la voit pas et la donnée survit à son auteur.
  -- Cette liste est l'endroit où on la complète, et elle se relit.
  delete from public.notes where user_id = uid;
  delete from public.user_roles where user_id = uid;
  delete from public.profiles where id = uid;

  -- ET LE COMPTE LUI-MÊME. C'est la ligne qui distingue « j'ai vidé vos
  -- données » de « votre compte n'existe plus » : sans elle, l'adresse reste
  -- connue du service, la session reste valide, et le droit à l'effacement
  -- n'est pas satisfait.
  delete from auth.users where id = uid;
end;
$$;

-- `create function` donne EXECUTE à `public` — c'est-à-dire à tout le monde,
-- `anon` compris. On le retire d'abord, on le rend ensuite au seul rôle qui
-- puisse avoir une session. Un appel par `anon` lèverait de toute façon
-- (`auth.uid()` est nul), mais une fonction qui efface des comptes n'a pas à
-- être atteignable par une clé publique.
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

comment on function public.delete_my_account() is
  'Efface les données de l''utilisateur courant puis son compte dans auth.users. '
  'security definer, propriété de postgres : c''est de lui qu''elle emprunte le '
  'droit d''écrire dans auth.users. Preuve : supabase/tests/suppression-compte.test.sql.';
