import { expect, test } from '@playwright/test';

/**
 * Lot 5 : les personnes et les regroupements, de bout en bout — ajouter une
 * personne, composer un regroupement, le voir DÉPLIÉ en personnes, et
 * retrouver le tout après un démarrage à froid.
 */
test.describe('@critical personnes et regroupements', () => {
  test('une personne s’ajoute, un regroupement se compose et se déplie, et tout survit au rechargement', async ({
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
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Personnes'
    );
    await expect(page.getByText('Alice')).toBeVisible();
    await expect(page.getByText('Moi')).toBeVisible();

    await page.getByRole('button', { name: 'Ajouter une personne' }).click();
    await page.getByLabel('Nom affiché').fill('Bob');
    await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
    await expect(page.getByText('Bob')).toBeVisible();
    await expect(page.getByText('2 personnes')).toBeVisible();

    await page.getByRole('tab', { name: 'Regroupements' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Regroupements'
    );
    await page.getByRole('button', { name: 'Créer un regroupement' }).click();
    await page.getByLabel('Nom', { exact: true }).fill('Nous');
    await page.getByRole('checkbox', { name: 'Alice' }).check();
    await page.getByRole('checkbox', { name: 'Bob' }).check();
    await page.getByRole('button', { name: 'Créer', exact: true }).click();
    await expect(page.getByText('Nous')).toBeVisible();
    await expect(page.getByText('2 membres')).toBeVisible();
    await expect(page.getByText('Alice, Bob')).toBeVisible();

    await page.reload();
    await expect(page.getByText('Nous')).toBeVisible();
    await expect(page.getByText('Alice, Bob')).toBeVisible();
  });
});
