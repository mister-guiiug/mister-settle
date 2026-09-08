import { expect, test } from '@playwright/test';

/**
 * Lot 8 : les soldes se lisent, une suggestion se déclare — et rien d'autre :
 * aucun argent ne bouge, l'application le dit — puis tout le monde est à
 * zéro.
 */
test.describe('@critical soldes et remboursements', () => {
  test('les soldes se lisent, une suggestion se déclare, et tout revient à zéro', async ({
    page,
  }) => {
    await page.goto('/espaces/nouveau');
    await page.getByLabel('Nom', { exact: true }).fill('Colocation');
    await page.getByLabel('Mon nom dans cet espace').fill('Alice');
    await page.getByRole('button', { name: 'Créer l’espace' }).click();
    await page.getByRole('link', { name: 'Personnes' }).click();
    await page.getByRole('button', { name: 'Ajouter une personne' }).click();
    await page.getByLabel('Nom affiché').fill('Bob');
    await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
    await expect(page.getByText('2 personnes')).toBeVisible();

    await page.getByRole('link', { name: 'Dépenses' }).click();
    await page.getByRole('link', { name: 'Nouvelle dépense' }).click();
    await page.getByLabel('Libellé').fill('Restaurant');
    await page.getByLabel('Montant (EUR)').fill('30');
    await page.getByRole('button', { name: 'Continuer' }).click();
    await page.getByRole('button', { name: 'Continuer' }).click();
    await page
      .getByRole('button', { name: 'Valider cette répartition' })
      .click();
    await expect(page.getByText('Validée', { exact: true })).toBeVisible();

    await page.getByRole('link', { name: 'Soldes' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Soldes');
    await expect(page.getByText(/^15,00/)).toBeVisible();
    await expect(page.getByText(/^-15,00/)).toBeVisible();

    await page.getByRole('link', { name: 'Régler' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Remboursements'
    );
    await expect(page.getByText(/ne transfère aucun argent/)).toBeVisible();
    await expect(page.getByText('Bob → Alice')).toBeVisible();
    await page.getByRole('button', { name: 'Déclarer', exact: true }).click();
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(
      page.getByText('Rien à régler : tout le monde est à zéro.')
    ).toBeVisible();

    await page.getByRole('link', { name: 'Soldes' }).click();
    await expect(page.getByText(/^0,00/).first()).toBeVisible();
    await expect(page.getByText(/^15,00/)).toHaveCount(0);

    await page.reload();
    await expect(page.getByText(/^0,00/).first()).toBeVisible();
  });
});
