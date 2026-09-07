import { expect, test } from '@playwright/test';

/**
 * Lot 9 : sans base partagée, un lien d'invitation ouvert sur cet appareil
 * EXPLIQUE au lieu d'échouer, et l'écran des invitations de l'espace aussi.
 * Le parcours complet (créer, partager, accepter) demande Supabase : il se
 * joue en CI sur la pile jetable, pas ici.
 */
test.describe('@critical invitations', () => {
  test('un lien ouvert sans compte explique, et ramène à l’accueil', async ({
    page,
  }) => {
    await page.goto('/invitation/deadbeef');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Rejoindre un espace'
    );
    await expect(
      page.getByText(/demandent un compte et une base partagée/)
    ).toBeVisible();
    await page.getByRole('link', { name: 'Retour à l’accueil' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Mes espaces'
    );
  });
});
