# 0014 — Des rôles par espace, décidés en base par des fonctions d'appartenance

## Contexte

L'ADR 0007 du squelette pose le principe — la base décide, l'interface obéit
— et le socle s'arrête à « qui est connecté » : pas de rôles, par choix
documenté. Le squelette lit un rôle **global** dans le jeton (`useRole`,
`app_metadata.roles`), ce qui convient à un administrateur d'application,
pas à « Alice administre le voyage en Bretagne et lit seulement la colocation ».

`miss-carbook` a déjà résolu ce problème pour ses dossiers : `workspace_members`
et des fonctions `security definer` (`is_workspace_member`,
`can_write_workspace`, `is_workspace_admin`) appelées depuis les politiques.
Elle a aussi payé deux pièges — la politique d'insertion du premier membre,
puis un RPC pour la remplacer.

## Décision

1. **Quatre rôles par espace** dans `space_memberships` : `owner` (un seul,
   index unique partiel), `admin`, `contributor`, `reader`.
2. **Des fonctions d'appartenance** `stable security definer set search_path`
   — `space_role`, `is_space_member`, `can_contribute`, `is_space_admin`,
   `is_space_owner` — et **chaque politique** les appelle. `reader` lit ;
   `contributor` écrit dépenses et remboursements ; `admin` gère personnes,
   regroupements, catégories, invitations, réglages ; `owner` archive,
   supprime, transfère.
3. **Tout ce qui crée plusieurs lignes passe par un RPC** : `create_space`
   écrit l'espace, l'adhésion `owner` et le participant du créateur dans une
   transaction. Le piège du premier membre n'existe pas ici, parce qu'aucune
   politique d'insertion directe n'existe sur `space_memberships`.
4. **Le rôle global du squelette reste** pour l'administration de
   l'application (`user_roles`, hook de jeton) ; il n'ouvre aucune donnée
   d'espace.
5. **Côté client, `useSpaceRole()` masque des boutons.** Ce n'est pas une
   autorisation ; l'ADR 0007 le dit déjà.

## Conséquences

Le double verrou de 0003 s'applique à chaque table : `revoke all`, puis les
`grant` un par un, puis les politiques. `expense_allocations` et
`expense_revisions` n'ont **aucun** grant d'écriture pour `authenticated` :
seules les fonctions les écrivent.

Les tests pgTAP jouent chaque rôle sur chaque table, et surtout la
**tentative d'accès à un espace où l'on n'est pas** — la seule assertion qui
vaille sur une application multi-espaces.

## Ce qu'on écarte

**Mettre les rôles d'espace dans le jeton.** Il faudrait le rafraîchir à chaque
invitation acceptée, et il porterait la liste de tous les espaces d'un compte.

**Une politique d'insertion « premier membre ».** C'est la version qui a dû
être corrigée deux fois ailleurs.
