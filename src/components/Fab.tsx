import { Plus } from 'lucide-react';
import { Link } from 'react-router-dom';

/**
 * LE GESTE PRINCIPAL, SOUS LE POUCE — ET IL DIT SON NOM.
 *
 * Un disque au centre, juste au-dessus de la barre basse, avec sa légende
 * dessous : sur un téléphone tenu d'une main, c'est la seule zone que le pouce
 * atteint sans rattraper l'appareil. La légende n'est pas une décoration —
 * c'est elle qui donne son nom accessible au lien. Un rond portant un « plus »
 * ne dit rien : ni ce qu'il crée, ni où il mène.
 *
 * C'EST UN LIEN, PAS UN BOUTON, parce que la destination est une adresse : on
 * peut l'ouvrir dans un autre onglet, la partager, y revenir en arrière. Le
 * signe « plus » est décoratif (`aria-hidden`), la légende porte le texte.
 *
 * L'apparence — dégradé, liseré, halo, appui — vit dans `index.css`, avec la
 * hauteur réservée à la barre basse.
 */
export function Fab({ to, label }: { to: string; label: string }) {
  return (
    <Link to={to} className="settle-fab" title={label}>
      <span className="settle-fab-disque">
        <Plus size={28} strokeWidth={2.5} aria-hidden="true" />
      </span>
      <span className="settle-fab-legende">{label}</span>
    </Link>
  );
}
