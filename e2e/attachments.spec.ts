import { expect, test } from '@playwright/test';

/** Un PNG de 1 × 1 pixel : assez pour traverser le pipeline d'image réel. */
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);

/**
 * Lot 10 : une photo jointe à une dépense traverse le pipeline du navigateur
 * (décodage, réencodage sans métadonnées), se range sur l'appareil, se lit
 * en vignette, et survit au rechargement.
 */
test.describe('@critical justificatifs', () => {
  test('une photo se joint à une dépense, se voit, et survit au rechargement', async ({
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
      .getByRole('button', { name: 'Enregistrer en brouillon' })
      .click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Dépense');

    await expect(page.getByText('Aucun justificatif.')).toBeVisible();
    await page.getByLabel('Ajouter une photo').setInputFiles({
      name: 'ticket.png',
      mimeType: 'image/png',
      buffer: PIXEL,
    });
    await expect(
      page.getByRole('img', { name: 'Justificatif 1' })
    ).toBeVisible();
    await expect(page.getByText('1 justificatif')).toBeVisible();

    await page.reload();
    await expect(
      page.getByRole('img', { name: 'Justificatif 1' })
    ).toBeVisible();
  });
});
