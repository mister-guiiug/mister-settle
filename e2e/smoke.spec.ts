import { expect, test } from '@playwright/test';

/**
 * Le SMOKE : ce qui doit marcher pour qu'une livraison ait un sens.
 *
 * Le tag `@critical` est celui que la CI de la famille exécute : une spec
 * sans lui n'est PAS jouée en intégration continue. Ces tests passent sur un
 * BUILD de production, service worker compris, en mode LOCAL — sans compte,
 * sans base : c'est la propriété que l'application doit garder (ADR 0004).
 */
test.describe('@critical le cadre', () => {
  test("l'accueil s'ouvre et porte un titre", async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Mes espaces'
    );
    await expect(page.getByText('Aucun espace pour le moment.')).toBeVisible();
  });

  test('un espace créé survit au rechargement, et s’ouvre', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Créer un espace' }).first().click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Nouvel espace'
    );

    const nom = `Bretagne ${Date.now()}`;
    await page.getByLabel('Nom').fill(nom);
    await page.getByLabel('Mon nom dans cet espace').fill('Alice');
    await page.getByRole('button', { name: 'Créer l’espace' }).click();

    // La création ouvre l'espace : son nom est le titre.
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(nom);
    await expect(page.getByText('1 personne')).toBeVisible();

    // Le vrai contrat de la persistance : ce qui est écrit se relit après un
    // démarrage à froid, pas seulement dans l'état vivant du magasin.
    await page.goto('/');
    await page.reload();
    await expect(
      page.getByRole('link', { name: `Ouvrir ${nom}` })
    ).toBeVisible();
  });

  test('les réglages d’un espace se modifient, avec la version en garde', async ({
    page,
  }) => {
    await page.goto('/espaces/nouveau');
    await page.getByLabel('Nom').fill('À renommer');
    await page.getByRole('button', { name: 'Créer l’espace' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'À renommer'
    );

    await page.getByRole('link', { name: 'Réglages' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Réglages de l’espace'
    );
    await page.getByLabel('Nom').fill('Renommé');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByText('Réglages enregistrés.')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Réglages de l’espace'
    );

    await page.goto('/');
    await expect(
      page.getByRole('link', { name: 'Ouvrir Renommé' })
    ).toBeVisible();
  });

  test('la navigation atteint les quatre destinations', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('link', { name: 'Réglages' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Réglages'
    );

    await page.getByRole('link', { name: 'Compte' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Compte');

    await page.getByRole('link', { name: 'À propos' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'À propos'
    );
  });

  test('sans backend, l’écran de compte le DIT au lieu de disparaître', async ({
    page,
  }) => {
    await page.goto('/compte');
    await expect(page.getByText('Mode local')).toBeVisible();
    await expect(page.getByTestId('zone-dangereuse')).toHaveCount(0);
  });

  test('un lien profond rafraîchi sert l’app, pas la page d’erreur', async ({
    page,
  }) => {
    await page.goto('/reglages');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Réglages'
    );
  });

  test('un fichier exporté s’importe, remplace tout, et survit au rechargement', async ({
    page,
  }) => {
    await page.goto('/espaces/nouveau');
    await page.getByLabel('Nom').fill('Avant import');
    await page.getByRole('button', { name: 'Créer l’espace' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Avant import'
    );

    await page.goto('/reglages');
    await page.getByLabel('Importer mes données').setInputFiles({
      name: 'mister-settle.json',
      mimeType: 'application/json',
      // Le format d'un export : l'enveloppe versionnée du magasin du socle.
      buffer: Buffer.from(
        JSON.stringify({
          v: 1,
          data: {
            spaces: [
              {
                id: '0f0e0d0c-0b0a-4908-8706-050403020100',
                name: 'Venu du fichier',
                description: '',
                currency: 'EUR',
                minorUnit: 2,
                icon: '',
                color: '',
                archivedAt: null,
                version: 1,
                myRole: 'owner',
                createdAt: '2026-09-06T08:00:00.000Z',
                updatedAt: '2026-09-06T08:00:00.000Z',
              },
            ],
            participants: [],
            groups: [],
            categories: [],
            expenses: [],
            revisions: [],
            settlements: [],
            activity: [],
            attachments: [],
            meName: 'Moi',
          },
        })
      ),
    });
    // Des espaces existent : l'import REMPLACE, donc il demande d'abord.
    await page.getByRole('button', { name: 'Confirmer' }).click();
    await expect(page.getByText('Données importées.')).toBeVisible();

    await page.goto('/');
    await expect(
      page.getByRole('link', { name: 'Ouvrir Venu du fichier' })
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Ouvrir Avant import' })
    ).toHaveCount(0);
    await page.reload();
    await expect(
      page.getByRole('link', { name: 'Ouvrir Venu du fichier' })
    ).toBeVisible();
  });

  test('les trois liens de la famille : sur l’accueil et « À propos », nulle part ailleurs', async ({
    page,
  }) => {
    const pied = page.locator('[data-dwc="app-footer"]');
    const liens = ['Code source', 'M’offrir un café', 'Signaler un problème'];

    for (const route of ['/', '/a-propos']) {
      await page.goto(route);
      await expect(pied, `pied de page attendu sur ${route}`).toBeVisible();
      for (const nom of liens) {
        await expect(
          pied.getByRole('link', { name: nom, exact: true }),
          `${nom} attendu une fois sur ${route}`
        ).toHaveCount(1);
      }
    }

    for (const route of ['/reglages', '/compte', '/espaces/nouveau']) {
      await page.goto(route);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(pied, `pied de page interdit sur ${route}`).toHaveCount(0);
    }
  });

  test('la langue bascule, et le cadre suit', async ({ page }) => {
    await page.goto('/reglages');
    await page.getByRole('tab', { name: 'EN' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Settings'
    );
    await expect(page.getByRole('link', { name: 'Spaces' })).toBeVisible();
  });
});
