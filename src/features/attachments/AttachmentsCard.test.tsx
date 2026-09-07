import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '../../i18n/index.ts';
import { backend } from '../../backend/index.ts';
import { localDb } from '../../backend/local.ts';
import { AttachmentsCard } from './AttachmentsCard.tsx';

/**
 * La carte, sans canvas ni IndexedDB : le pipeline est injecté, et c'est
 * son verdict qu'on vérifie à l'écran — la mécanique d'envoi appartient à
 * l'adaptateur, testée par ailleurs.
 */
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('dwc_locale', 'fr');
  localDb.clear();
});

async function seed() {
  const space = await backend.spaces.create({
    name: 'Coloc',
    currency: 'EUR',
    meName: 'Alice',
  });
  const [alice] = await backend.participants.list(space.id);
  if (!alice) throw new Error('Alice manque');
  const saved = await backend.expenses.save(
    {
      spaceId: space.id,
      label: 'Restaurant',
      amount: 3000,
      currency: 'EUR',
      spentOn: '2026-09-01',
      splitMethod: 'equal',
      payers: [{ participantId: alice.id, amount: 3000 }],
      beneficiaries: [{ participantId: alice.id, position: 0 }],
    },
    null
  );
  return { space, expenseId: saved.id };
}

describe('AttachmentsCard', () => {
  it('dit qu’il n’y a rien, et propose une photo', async () => {
    const { space, expenseId } = await seed();
    render(
      <I18nProvider>
        <AttachmentsCard spaceId={space.id} parent={{ expenseId }} editable />
      </I18nProvider>
    );
    expect(await screen.findByText('Aucun justificatif.')).toBeInTheDocument();
    expect(screen.getByLabelText('Ajouter une photo')).toBeInTheDocument();
    expect(screen.getByText(/sans métadonnées/)).toBeInTheDocument();
  });

  it('refuse un fichier qui n’est pas une image, dans la langue de l’utilisateur', async () => {
    const { space, expenseId } = await seed();
    render(
      <I18nProvider>
        <AttachmentsCard
          spaceId={space.id}
          parent={{ expenseId }}
          editable
          prepare={async () => ({ ok: false, error: 'type' })}
        />
      </I18nProvider>
    );
    await screen.findByText('Aucun justificatif.');
    const file = new File(['%PDF'], 'note.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText('Ajouter une photo'), {
      target: { files: [file] },
    });
    expect(
      await screen.findByText(/n’est pas une image acceptée/)
    ).toBeInTheDocument();
  });

  it('ne propose rien à qui ne peut pas contribuer', async () => {
    const { space, expenseId } = await seed();
    render(
      <I18nProvider>
        <AttachmentsCard
          spaceId={space.id}
          parent={{ expenseId }}
          editable={false}
        />
      </I18nProvider>
    );
    await screen.findByText('Aucun justificatif.');
    expect(
      screen.queryByLabelText('Ajouter une photo')
    ).not.toBeInTheDocument();
  });
});
