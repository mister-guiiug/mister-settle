# Instructions pour les agents

Ce dépôt est le **squelette** dont les applications de la famille partent. Ce
qu'on y écrit part donc dans toutes les applications suivantes : la barre est
plus haute qu'ailleurs, et c'est le seul intérêt du dépôt.

## Les trois règles

**1. Ce qui est ici doit être justifié par une mesure, pas par une opinion.**
Chaque pièce du squelette existe parce que son absence a coûté quelque chose
dans le parc, et le commentaire le dit. Une pièce ajoutée « parce que c'est
mieux » est une pièce que dix-huit applications porteront sans savoir pourquoi.

**2. Une décision se prend dans `docs/adr/`, pas dans le code.** Le code montre
la décision ; l'ADR dit le contexte, les conséquences désagréables comprises,
et ce qu'on écarte. Un squelette sans ses décisions n'est qu'un gabarit.

**3. La porte doit rester passable.** `npm run build` enchaîne le budget de
poids et `pwa-doctor --strict` : **zéro défaut, zéro dette, zéro info**. Si un
contrôle devient impossible à satisfaire, le corriger dans le socle plutôt que
de le désactiver ici — c'est ce qui est arrivé deux fois le jour de la création,
et les deux fois le socle avait tort.

## Ce qui vient du socle, et ne se réécrit pas

Avant d'écrire quoi que ce soit, chercher dans
[`@mister-guiiug/dev-pwa-config`](https://github.com/mister-guiiug/dev-pwa-config).
Il publie plus de cent quarante sous-chemins, et le parc a mesuré que la
plupart des réécritures venaient de leur méconnaissance, pas d'un manque.

Notamment : le manifeste PWA (`vite-pwa`), la CSP, le SEO, le repli 404, les
primitives d'interface et leur habillage, l'i18n et ses formateurs, les
libellés en sept langues, le magasin versionné, le sélecteur de backend, le
journal, l'observabilité, la mise à jour du service worker, les workflows.

## Le piège qui revient

**`components.css` est le prérequis de toute adoption de `/react`.** Les
composants du socle ne posent que des attributs `data-dwc` : sans cette
feuille, ils compilent, les tests passent, le lint est vert, et l'écran est
cassé. Elle est importée dans `src/index.css` — ne pas la retirer.

## Modifier

Une pull request, la CI verte, et un ADR si la modification change une
décision. Le dépôt est protégé : aucun commit n'atterrit sur `main` sans PR.

Les commits suivent [Conventional Commits](https://www.conventionalcommits.org/fr/),
sujet en français, à l'impératif. Le corps explique **pourquoi** : le diff dit
déjà quoi.
