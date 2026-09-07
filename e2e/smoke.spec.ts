import { expect, test } from '@playwright/test';

/**
 * Le SMOKE : ce qui doit marcher pour qu'une livraison ait un sens.
 *
 * Le tag `@critical` est celui que la CI de la famille exécute
 * (`playwright test --grep @critical`) : une spec sans lui n'est PAS jouée en
 * intégration continue, et le workflow rapporte « No tests found » sans
 * échouer. C'est une panne silencieuse que le parc a déjà connue.
 *
 * Ces tests passent sur un BUILD de production, service worker compris.
 */
test.describe('@critical le cadre', () => {
  test("l'accueil s'ouvre et porte un titre", async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Notes');
  });

  test('une note ajoutée survit au rechargement', async ({ page }) => {
    await page.goto('/');

    const texte = `note de test ${Date.now()}`;
    await page.getByLabel('Nouvelle note').fill(texte);
    await page.getByRole('button', { name: 'Ajouter' }).click();
    await expect(page.getByText(texte)).toBeVisible();

    // Le vrai contrat de la persistance : ce qui est écrit se relit après un
    // démarrage à froid, pas seulement dans l'état vivant du magasin.
    await page.reload();
    await expect(page.getByText(texte)).toBeVisible();
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
    // La propriété que la variante Supabase ne doit pas casser : l'application
    // reste entière sans configuration. Un écran masqué par une condition
    // finit par diverger de celui qui s'affiche, et personne ne le voit avant
    // la mise en service.
    await page.goto('/compte');
    await expect(page.getByText('Mode local')).toBeVisible();
  });

  test('un lien profond rafraîchi sert l’app, pas la page d’erreur', async ({
    page,
  }) => {
    // Le repli SPA de `spaFallbackPlugin` : sans lui, GitHub Pages sert sa
    // propre page « File not found » sur un lien partagé ouvert à froid.
    // Quatre applications de la famille en souffraient en production.
    await page.goto('/reglages');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Réglages'
    );
  });

  test('un fichier exporté s’importe, remplace tout, et survit au rechargement', async ({
    page,
  }) => {
    // Le seul moyen de changer d'appareil sans compte. Quinze apps du parc
    // savent exporter ; presque aucune ne relit son propre fichier.
    await page.goto('/');
    await page.getByLabel('Nouvelle note').fill('avant import');
    await page.getByRole('button', { name: 'Ajouter' }).click();
    await expect(page.getByText('avant import')).toBeVisible();

    await page.goto('/reglages');
    await page.getByLabel('Importer mes notes').setInputFiles({
      name: 'notes.json',
      mimeType: 'application/json',
      // Le format d'un export : l'enveloppe versionnée du magasin du socle.
      buffer: Buffer.from(
        JSON.stringify({
          v: 1,
          data: {
            notes: [
              {
                id: 'note_e2e',
                text: 'venue du fichier',
                createdAt: '2026-09-06T08:00:00.000Z',
              },
            ],
          },
        })
      ),
    });
    // Des notes existent : l'import REMPLACE, donc il demande d'abord.
    await page.getByRole('button', { name: 'Confirmer' }).click();
    // Pas `getByRole('status')` : la page en porte déjà une (la bannière de
    // connexion du socle), et le mode strict refuserait l'ambiguïté.
    await expect(page.getByText('1 note importée.')).toBeVisible();

    await page.goto('/');
    await expect(page.getByText('venue du fichier')).toBeVisible();
    await expect(page.getByText('avant import')).toHaveCount(0);
    await page.reload();
    await expect(page.getByText('venue du fichier')).toBeVisible();
  });

  test('la fiche d’installation se propose quand le navigateur le permet', async ({
    page,
  }) => {
    await page.goto('/a-propos');
    // Aucun navigateur n'émet `beforeinstallprompt` sur un site de test : on
    // le simule, avec la forme que `useInstallPrompt` du socle attend.
    await page.evaluate(() => {
      const event = new Event('beforeinstallprompt', { cancelable: true });
      Object.assign(event, {
        prompt: () => Promise.resolve(),
        userChoice: Promise.resolve({ outcome: 'dismissed' }),
      });
      window.dispatchEvent(event);
    });
    await expect(
      page.getByRole('region', { name: 'Installer l’application' })
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Installer' })).toBeVisible();
  });

  test('« Signaler un problème » part avec la version et l’écran', async ({
    page,
  }) => {
    await page.goto('/reglages');
    const lien = page.getByRole('link', { name: 'Signaler un problème' });
    await expect(lien).toHaveAttribute(
      'href',
      /\/issues\/new\?template=bug\.yml/
    );
    const url = new URL((await lien.getAttribute('href')) ?? '');
    // La version injectée par `vite-version` au build, et l'écran courant :
    // ce qu'un rapport n'a jamais quand on le demande après coup.
    expect(url.searchParams.get('version')).toMatch(/^v\d+\.\d+\.\d+/);
    expect(url.searchParams.get('environnement')).toContain('écran ');
    expect(url.searchParams.get('environnement')).toContain('/reglages');
  });

  test('la langue bascule, et le cadre suit', async ({ page }) => {
    await page.goto('/reglages');

    // `SegmentedControl` du socle expose un `tablist`, pas un groupe de
    // boutons radio : le rôle se lit dans le rendu, il ne se devine pas.
    await page.getByRole('tab', { name: 'EN' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Settings'
    );
    // `LabelsProvider` est posé par le fournisseur i18n : les libellés des
    // composants du socle suivent sans que l'app ait rien à câbler.
    await expect(page.getByRole('link', { name: 'Home' })).toBeVisible();
  });
});
