import type { ReactNode } from 'react';
import { EmptyState } from '@mister-guiiug/dev-pwa-config/react/empty-state';
import { BrandGlyph } from './BrandGlyph.tsx';

/**
 * État vide du socle, avec le S Ledger en illustration — pas d'emoji, pas
 * d'icône générique. Un seul endroit pour la marque filigranée.
 */
export function SettleEmptyState({
  title,
  description,
  children,
  action,
  className,
  icon,
}: {
  icon?: ReactNode;
  title?: ReactNode;
  description?: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <EmptyState
      icon={
        icon ?? (
          <span className="settle-empty-mark">
            <BrandGlyph size={56} />
          </span>
        )
      }
      title={title}
      description={description}
      action={action}
      className={className}
    >
      {children}
    </EmptyState>
  );
}
