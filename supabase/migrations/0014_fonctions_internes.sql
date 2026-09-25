-- Mister Settle — 0014 — les fonctions internes de la répartition ne sont plus
-- appelables de l'extérieur.
--
-- LE DÉFAUT CORRIGÉ. `settle_split`, `settle_fingerprint` et
-- `settle_expense_snapshot` (0009) sont `security definer` et ne vérifient
-- rien : ce sont des outils de `save_expense` et de `validate_expense`, qui,
-- eux, contrôlent l'appartenance à l'espace avant de les appeler. 0009 les
-- retirait bien à `public` et à `anon`, mais les RENDAIT à `authenticated`.
-- Tout compte connecté pouvait donc lire, par
-- `rpc/settle_expense_snapshot`, une dépense complète (montant, payeurs,
-- bénéficiaires, parts) d'un espace dont il n'est pas membre, dès qu'il en
-- connaît l'identifiant. Même chose pour la répartition d'une dépense avec
-- `rpc/settle_split`. Relevé le 25/09/2026, dans une revue des fonctions
-- `security definer` du parc.
--
-- Aucun client ne les appelle : `src/` n'en contient aucune mention. Leurs
-- seuls appelants sont des fonctions `security definer` de `postgres`, sous
-- qui le droit d'exécution se vérifie. Les retirer à `authenticated` ne casse
-- donc rien. `settle_minor` et `settle_from_minor`, pur calcul sans lecture,
-- restent ouvertes.
--
-- Rejouable sans effet de bord.

revoke execute on function
  settle_split(uuid),
  settle_fingerprint(uuid),
  settle_expense_snapshot(uuid)
  from authenticated;
