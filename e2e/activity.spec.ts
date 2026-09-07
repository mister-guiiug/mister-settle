import { expect, test } from '@playwright/test';

/**
 * Lot 11 : le journal d'un espace raconte ce qui s'y est passé — et il vit
 * sous « Plus », là où la barre basse replie ce qui dépasse ses places.
 */
test.describe('@critical activité', () => {
  test('le journal raconte la dépense validée, sous « Plus »', async ({
    page,
  }) => {
    await page.goto('/espaces/nouveau');
    await page.getByLabel('Nom', { exact: true }).fill('Colocation');
    await page.getByLabel('Mon nom dans cet espace').fill('Alice');
    await page.getByRole('button', { name: 'Créer l’espace' }).click();
    await page.getByRole('link', { name: 'Dépenses' }).click();
    await page
      .getByRole('button', { name: 'Nouvelle dépense' })
      .first()
      .click();
    await page.getByLabel('Libellé').fill('Restaurant');
    await page.getByLabel('Montant (EUR)').fill('30');
    await page.getByRole('button', { name: 'Continuer' }).click();
    await page.getByRole('button', { name: 'Continuer' }).click();
    await page
      .getByRole('button', { name: 'Valider cette répartition' })
      .click();
    await expect(page.getByText('Validée', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Plus' }).click();
    await page.getByRole('link', { name: 'Activité' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Activité'
    );
    await expect(
      page.getByText(/Répartition de « Restaurant » validée/)
    ).toBeVisible();
    await expect(page.getByText('Espace « Colocation » créé')).toBeVisible();
  });
});
