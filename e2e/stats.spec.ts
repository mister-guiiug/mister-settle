import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

/**
 * Lot 13 : les statistiques comptent la dépense validée, et l'export CSV
 * arrive au clic — un vrai fichier, lisible par Excel en français.
 */
test.describe('@critical statistiques', () => {
  test('les statistiques comptent la dépense validée, et le CSV se télécharge', async ({
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
    await page.getByRole('link', { name: 'Statistiques' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Statistiques'
    );
    await expect(page.getByText('Sans catégorie')).toBeVisible();
    await expect(page.getByText('100 %')).toBeVisible();
    await expect(page.getByText(/avancé 30,00/)).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Dépenses (CSV)' }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(
      /^mister-settle-colocation-depenses-.*\.csv$/
    );
    const file = await download.path();
    const csv = readFileSync(file, 'utf8');
    expect(csv).toContain('Date;Libellé;Catégorie;Montant');
    expect(csv).toContain('Restaurant');
  });
});
