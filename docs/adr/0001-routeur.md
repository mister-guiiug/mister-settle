# 0001 — Routeur par chemin, pas par `#`

## Contexte

Relevé du 02/09/2026 sur les seize sites publiés : **neuf applications routent
par `#`, six par chemin, trois n'ont pas de routes**. Aucune ne dit pourquoi.

Le routage par `#` est choisi par défaut sur GitHub Pages pour une raison
réelle : l'hébergeur n'a pas de repli SPA, et rafraîchir `/mon-app/reglages`
sert sa page « File not found ». Quatre applications à routage par chemin
étaient effectivement en panne ce jour-là ; deux autres avaient chacune écrit
la même correction, à la ligne près.

## Décision

**`BrowserRouter`, avec `basename={import.meta.env.BASE_URL}`.**

Le repli est traité en deux endroits, tous deux fournis par le socle :

- `spaFallbackPlugin()` copie `index.html` en `404.html` à la fin du build ;
- `pwa-deploy.yml` refait la copie si le build ne l'a pas émise.

## Conséquences

Les URL sont partageables et indexables, et la canonique désigne une vraie
adresse. Une application installée conserve son chemin.

Le prix : deux mécanismes doivent rester en place. Les retirer ne casse rien
tout de suite — le service worker sert `index.html` à toute navigation dans son
périmètre après la première visite. **Le défaut ne se voit que sur un lien
partagé ouvert à froid, sur un navigateur sans service worker, et sur tout ce
qui indexe.** C'est exactement pourquoi il a survécu si longtemps, et pourquoi
un test e2e le vérifie ici (`smoke.spec.ts`, « un lien profond rafraîchi »).

## Ce qu'on écarte

**Le routage par `#`.** Il fonctionne, et une application qui le porte déjà n'a
aucune raison d'en changer. Mais il rend les URL moins lisibles, et il masque
le problème au lieu de le résoudre : le jour où l'application déménage vers un
hébergeur qui sait faire un repli, elle traîne encore ses `#`.

**Un routeur maison.** Trois applications du parc avaient un `Shell` local de
38, 97 et 538 lignes qui n'avaient rien en commun que le nom.
