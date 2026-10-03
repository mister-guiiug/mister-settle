import { Link } from 'react-router-dom';
import { useI18n } from '../i18n/index.ts';

/**
 * LA MARQUE DANS L'EN-TÊTE. Un seul fichier (`public/favicon.svg`) sert
 * l'onglet, le manifeste et ce leading — comme chez mister-miss-koh. Le
 * lien ramène toujours à « Mes espaces » : dans un espace, il remplace
 * l'icône maison qui doublonnait la barre.
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
      <img
        className="settle-brand-mark"
        src={`${import.meta.env.BASE_URL}favicon.svg`}
        width={28}
        height={28}
        alt=""
      />
    </Link>
  );
}
