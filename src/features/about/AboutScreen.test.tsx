import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '../../i18n/index.ts';
import { AboutScreen } from './AboutScreen.tsx';

function Wrapper({ children }: { children: ReactNode }) {
  localStorage.setItem('dwc_locale', 'fr');
  return (
    <I18nProvider>
      <MemoryRouter>{children}</MemoryRouter>
    </I18nProvider>
  );
}

describe('AboutScreen', () => {
  it('ouvre sur la promesse de marque et le glyphe', () => {
    render(<AboutScreen />, { wrapper: Wrapper });
    expect(screen.getByText('Calcule. Ne paie jamais.')).toBeInTheDocument();
    expect(
      screen.getByText(/répartit les dépenses d’un groupe/)
    ).toBeInTheDocument();
    expect(document.querySelector('img.settle-about-mark')).toBeTruthy();
  });
});
