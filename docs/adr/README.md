# Les décisions, et pourquoi elles sont écrites

Un gabarit donne des fichiers. Un squelette donne des **décisions déjà prises**,
avec leur raison — c'est la seule différence qui compte, et c'est elle qui évite
que chaque application refasse le même arbitrage sans savoir qu'il a déjà été
tranché ailleurs.

Le parc a mesuré ce que coûte l'absence de ces pages : **neuf applications
routent par `#` et six par chemin**, sans qu'aucune ne dise pourquoi ; trois
rechargeaient la page en pleine saisie ; quatre-vingt-huit endroits figeaient la
locale en dur. Aucun de ces écarts n'est une faute de code. Ce sont des
décisions jamais prises, donc reprises au hasard.

## Ce qu'une décision doit contenir

Le contexte mesuré, la décision, ses conséquences — **y compris désagréables**
— et ce qu'elle écarte. Une décision qui ne dit pas ce qu'elle refuse n'aide
personne à la rediscuter.

| #                                               | Décision                                                         |
| ----------------------------------------------- | ---------------------------------------------------------------- |
| [0001](./0001-routeur.md)                       | Routeur par CHEMIN, pas par `#`                                  |
| [0002](./0002-etat-et-persistance.md)           | Zustand pour l'état vivant, magasin versionné pour ce qui survit |
| [0003](./0003-i18n.md)                          | i18n du socle, deux langues, formateurs liés à la locale         |
| [0004](./0004-backend.md)                       | Un port, un repli local, une migration port par port             |
| [0005](./0005-mise-a-jour-du-service-worker.md) | `prompt`, jamais `autoUpdate`                                    |
| [0006](./0006-observabilite.md)                 | Journal toujours, Sentry seulement s'il est configuré            |
| [0007](./0007-comptes-et-droits.md)             | La base décide des droits ; l'interface se contente d'obéir      |
| [0008](./0008-annuler-plutot-que-confirmer.md)  | Annuler remplace confirmer : un sursis de huit secondes          |
| [0009](./0009-supprimer-son-compte.md)          | Effacer son compte, pas seulement ses données — et le prouver    |
| [0010](./0010-ecrire-hors-ligne.md)             | Écrire hors ligne : une file sur le port, pas dans l'adaptateur  |
| [0011](./0011-monnaie-entiere.md)               | La monnaie est un entier, et l’arithmétique vit deux fois        |
| [0012](./0012-regroupements-non-comptables.md)  | Les regroupements ne comptent pas, et leur composition est figée |
| [0013](./0013-validation-explicite.md)          | Une répartition se valide explicitement, sur une empreinte       |
| [0014](./0014-roles-par-espace.md)              | Des rôles par espace, décidés en base                            |
| [0015](./0015-hors-ligne.md)                    | Hors ligne : lire, brouillonner, mettre en file la création      |

## Quand une application s'écarte

Elle le fait, et elle l'écrit. Une exception documentée reste une décision ;
une exception silencieuse devient une dette que le prochain relevé comptera
sans pouvoir dire si elle est voulue. C'est la leçon des `GARDES` de la
campagne d'adoption : vingt-quatre copies sur trente-quatre n'étaient pas des
dettes, mais rien ne permettait de le dire avant de les avoir lues une à une.
