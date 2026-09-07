import { Plus } from 'lucide-react';
import { Link } from 'react-router-dom';

/**
 * LE GESTE PRINCIPAL, SOUS LE POUCE.
 *
 * Un bouton rond, au centre, juste au-dessus de la barre basse : sur un
 * téléphone tenu d'une main, c'est la seule zone que le pouce atteint sans
 * rattraper l'appareil. Le bouton d'en-tête reste — il porte le mot, celui-ci
 * porte le geste ; l'un se lit, l'autre s'atteint.
 *
 * C'EST UN LIEN, PAS UN BOUTON, parce que la destination est une adresse : on
 * peut l'ouvrir dans un autre onglet, la partager, y revenir en arrière. Le
 * signe « plus » est décoratif ; ce que les lecteurs d'écran annoncent, c'est
 * `label`, qui dit l'action en toutes lettres (« Ajouter une dépense »), pas
 * « plus ».
 *
 * La position, l'ombre et l'anneau de focus vivent dans `index.css`, avec la
 * hauteur réservée à la barre basse — la même expression qu'elle, au même
 * endroit.
 */
export function Fab({ to, label }: { to: string; label: string }) {
  return (
    <Link to={to} aria-label={label} title={label} className="settle-fab">
      <Plus size={26} aria-hidden="true" />
    </Link>
  );
}
