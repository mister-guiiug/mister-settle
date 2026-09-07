import { expect, test } from '@playwright/test';

/**
 * Lots 6 et 7 : créer une dépense par l'assistant, la VALIDER (R9), la
 * retrouver validée dans la liste, et voir le solde en tenir compte (R11) —
 * puis tout retrouver après un démarrage à froid.
 */
test.describe('@critical dépenses', () => {
  test('une dépense se crée, se valide, entre dans les soldes, et survit au rechargement', async ({
    page,
  }) => {
    await page.goto('/espaces/nouveau');
    await page.getByLabel('Nom', { exact: true }).fill('Colocation');
    await page.getByLabel('Mon nom dans cet espace').fill('Alice');
    await page.getByRole('button', { name: 'Créer l’espace' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Colocation'
    );

    await page.getByRole('link', { name: 'Personnes' }).click();
    await page.getByRole('button', { name: 'Ajouter une personne' }).click();
    await page.getByLabel('Nom affiché').fill('Bob');
    await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
    await expect(page.getByText('2 personnes')).toBeVisible();

    await page.getByRole('link', { name: 'Dépenses' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Dépenses'
    );
    await page
      .getByRole('button', { name: 'Nouvelle dépense' })
      .first()
      .click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Nouvelle dépense'
    );
    await page.getByLabel('Libellé').fill('Restaurant');
    await page.getByLabel('Montant (EUR)').fill('30');
    await page.getByRole('button', { name: 'Continuer' }).click();
    await expect(page.getByText('Personnes retenues (2)')).toBeVisible();
    await page.getByRole('button', { name: 'Continuer' }).click();
    await expect(page.getByText('Par personne')).toBeVisible();
    await page
      .getByRole('button', { name: 'Valider cette répartition' })
      .click();

    // Le détail : validée, et chacun sa moitié.
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Dépense');
    await expect(page.getByText('Validée', { exact: true })).toBeVisible();
    await expect(page.getByText('Restaurant')).toBeVisible();

    await page.getByRole('link', { name: 'Dépenses' }).click();
    await expect(page.getByText('1 dépense')).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Ouvrir Restaurant' })
    ).toBeVisible();

    // Le solde : Alice a payé 30 pour deux, Bob lui doit 15.
    await page.getByRole('link', { name: 'Retour' }).click();
    await expect(page.getByText('Mon solde')).toBeVisible();
    await expect(page.getByText(/15,00/).first()).toBeVisible();
    await expect(page.getByText('1 dépense validée')).toBeVisible();

    await page.reload();
    await expect(page.getByText('1 dépense validée')).toBeVisible();
  });
});
