import { Link } from 'react-router-dom';
import { useI18n } from '../i18n/index.ts';
import { BrandGlyph } from './BrandGlyph.tsx';

/**
 * LA MARQUE DANS L'EN-TÊTE. Un seul fichier (`public/favicon.svg`) sert
 * l'onglet, le manifeste et ce leading — comme chez mister-miss-koh. Le
 * lien ramène toujours à « Mes espaces » : dans un espace, il remplace
 * l'icône maison qui doublonnait la barre.
 *
 * Hors session sur `/`, l'en-tête pose plutôt le `Wordmark` en `h1` et
 * n'affiche pas ce leading — sinon le logo se répéterait.
 */
export function BrandMark() {
  const { t } = useI18n();
  return (
    <Link
      to="/"
      className="settle-brand"
      aria-label={t('app.name')}
      title={t('app.name')}
    >
      <BrandGlyph size={28} />
    </Link>
  );
}
