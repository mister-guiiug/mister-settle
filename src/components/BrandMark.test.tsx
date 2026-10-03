import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { I18nProvider } from '../i18n/index.ts';
import { BrandMark } from './BrandMark.tsx';

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <I18nProvider>
      <MemoryRouter>{children}</MemoryRouter>
    </I18nProvider>
  );
}

describe('BrandMark', () => {
  it('lie l’accueil et sert le favicon', () => {
    localStorage.setItem('dwc_locale', 'fr');
    render(<BrandMark />, { wrapper: Wrapper });
    const link = screen.getByRole('link', { name: 'Mister Settle' });
    expect(link).toHaveAttribute('href', '/');
    const img = link.querySelector('img');
    expect(img).toHaveAttribute('src', expect.stringContaining('favicon.svg'));
    expect(img).toHaveAttribute('alt', '');
  });
});
