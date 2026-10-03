import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { I18nProvider } from '../i18n/index.ts';
import { Wordmark } from './Wordmark.tsx';

function Wrapper({ children }: { children: ReactNode }) {
  localStorage.setItem('dwc_locale', 'fr');
  return <I18nProvider>{children}</I18nProvider>;
}

describe('Wordmark', () => {
  it('affiche le nom de l’app à côté du glyphe', () => {
    render(<Wordmark />, { wrapper: Wrapper });
    expect(screen.getByText('Mister Settle')).toBeInTheDocument();
    expect(document.querySelector('img.settle-brand-mark')).toHaveAttribute(
      'src',
      expect.stringContaining('favicon.svg')
    );
  });
});
