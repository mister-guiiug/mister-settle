import { expect, test } from '@playwright/test';

/**
 * Lot 12 : sans réseau, l'application LOCALE continue — c'est la propriété
 * de l'ADR 0004 —, et la page hors ligne dit qu'ici rien n'attend. Les
 * écrans nécessaires (assistant, détail) sont chargés une première fois en
 * ligne : le test vérifie l'application, pas la précache du service worker.
 */
test.describe('@critical hors ligne', () => {
  test('sans réseau, une dépense se crée quand même, et la page hors ligne explique', async ({
    page,
    context,
  }) => {
    await page.goto('/espaces/nouveau');
    await page.getByLabel('Nom', { exact: true }).fill('Colocation');
    await page.getByLabel('Mon nom dans cet espace').fill('Alice');
    await page.getByRole('button', { name: 'Créer l’espace' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Colocation'
    );

    // Une première dépense EN LIGNE : l'assistant et le détail sont chargés.
    await page.getByRole('link', { name: 'Dépenses' }).click();
    await page.getByRole('link', { name: 'Nouvelle dépense' }).click();
    await page.getByLabel('Libellé').fill('Pain');
    await page.getByLabel('Montant (EUR)').fill('3');
    await page.getByRole('button', { name: 'Continuer' }).click();
    await page.getByRole('button', { name: 'Continuer' }).click();
    await page
      .getByRole('button', { name: 'Enregistrer en brouillon' })
      .click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Dépense');
    await page.getByRole('link', { name: 'Retour' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Dépenses'
    );

    // Puis SANS RÉSEAU : la même chose, et rien ne casse.
    await context.setOffline(true);
    await page.getByRole('link', { name: 'Nouvelle dépense' }).click();
    await page.getByLabel('Libellé').fill('Lait');
    await page.getByLabel('Montant (EUR)').fill('2');
    await page.getByRole('button', { name: 'Continuer' }).click();
    await page.getByRole('button', { name: 'Continuer' }).click();
    await page
      .getByRole('button', { name: 'Enregistrer en brouillon' })
      .click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Dépense');
    await expect(page.getByText('Lait')).toBeVisible();
    await expect(page.getByText('Brouillon', { exact: true })).toBeVisible();
    await context.setOffline(false);

    await page.goto('/hors-ligne');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Hors ligne'
    );
    await expect(
      page.getByText(
        'Ici, tout vit sur cet appareil : rien n’attend le réseau.'
      )
    ).toBeVisible();
  });
});
