import { expect, test } from '@playwright/test';

/**
 * Lot 12 : sans réseau, l'application LOCALE continue — c'est la propriété
 * de l'ADR 0004 —, et la page hors ligne dit qu'ici rien n'attend. Les
 * écrans nécessaires (assistant, détail) sont chargés une première fois en
 * ligne : le test vérifie l'application, pas la précache du service worker.
 */
test.describe('@critical hors ligne', () => {
  /*
   * LA BUILD SE RECHARGE SANS RÉSEAU. Le test ci-dessous charge ses écrans en
   * ligne et ne recharge jamais : il éprouve l'application, pas le précache.
   * Celui-ci éprouve ce que l'audit du 05/11/2026 a trouvé cassé en
   * production — un morceau statiquement importé par l'entrée, mais exclu du
   * précache (`sentry.js`, où Rolldown avait rangé React). Hors ligne, React
   * ne montait plus : seul restait le texte statique de la page.
   *
   * La coupure est celle de l'essai réel : `setOffline` ET toute requête
   * refusée, y compris celles du worker — ce que seul Chromium route.
   * « Aucun espace pour le moment » n'est rendu QUE par React : le titre, lui,
   * est déjà dans le HTML servi, et ne prouverait rien.
   */
  test('la build se recharge hors ligne : la coquille vient du précache, React monte', async ({
    page,
    context,
    browserName,
  }) => {
    test.skip(
      browserName !== 'chromium',
      'seul Chromium route les requêtes du service worker'
    );
    await page.goto('/');
    await expect(page.getByText('Aucun espace pour le moment.')).toBeVisible();
    // Le worker actif, c'est le précache rempli ; un rechargement le met aux
    // commandes de la page.
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await expect
      .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
      .toBe(true);

    await context.setOffline(true);
    await context.route('**/*', route => route.abort('internetdisconnected'));
    await page.reload();

    await expect(page.getByText('Aucun espace pour le moment.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Réglages' })).toBeVisible();
  });

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

    // `/hors-ligne` est devenu l'écran « Synchronisation » (DESIGN.md, point
    // 8) ; il explique toujours qu'en local, rien n'attend le réseau.
    await page.goto('/hors-ligne');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Synchronisation'
    );
    await expect(
      page.getByText(
        'Ici, tout vit sur cet appareil : rien n’attend le réseau.'
      )
    ).toBeVisible();
  });
});
