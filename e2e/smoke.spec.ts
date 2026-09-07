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

  test('supprimée par erreur, une note s’annule et revient à sa place', async ({
    page,
  }) => {
    // ANNULER REMPLACE CONFIRMER. Le dialogue demandait de se décider AVANT,
    // sur un résultat qu'on ne voyait pas encore ; le sursis laisse voir le
    // résultat, puis se dédire. Aucune application du parc n'offrait
    // d'annulation après suppression d'un enregistrement.
    await page.goto('/');
    await page.getByLabel('Nouvelle note').fill('à garder');
    await page.getByRole('button', { name: 'Ajouter' }).click();
    await page.getByLabel('Nouvelle note').fill('supprimée par erreur');
    await page.getByRole('button', { name: 'Ajouter' }).click();
    await expect(page.getByText('supprimée par erreur')).toBeVisible();

    // Deux notes, donc deux boutons « Supprimer » : la ligne désigne le sien.
    await page
      .getByRole('listitem')
      .filter({ hasText: 'supprimée par erreur' })
      .getByRole('button', { name: 'Supprimer' })
      .click();
    // Aucun dialogue : la note part tout de suite.
    await expect(page.getByText('supprimée par erreur')).toHaveCount(0);

    await page.getByRole('button', { name: 'Annuler' }).click();
    await expect(page.getByText('supprimée par erreur')).toBeVisible();
    await expect(page.getByText('à garder')).toBeVisible();

    // Rien n'avait été écrit : le rechargement le prouve, et c'est la seule
    // preuve qui compte — l'état vivant du magasin, lui, ne survit pas.
    await page.reload();
    await expect(page.getByText('supprimée par erreur')).toBeVisible();
  });

  test('laissé filer, le sursis écrit la suppression pour de bon', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByLabel('Nouvelle note').fill('vraiment supprimée');
    await page.getByRole('button', { name: 'Ajouter' }).click();
    await expect(page.getByText('vraiment supprimée')).toBeVisible();

    await page.getByRole('button', { name: 'Supprimer' }).click();

    // Le bouton d'annulation disparaît À L'INSTANT où il cesse d'être vrai :
    // c'est le magasin qui tient la minuterie, et la notification n'est que
    // son affichage. Un bouton qui reste affiché sans effet est pire que pas
    // de bouton du tout.
    await expect(page.getByRole('button', { name: 'Annuler' })).toHaveCount(0, {
      timeout: 15_000,
    });

    await page.reload();
    await expect(page.getByText('vraiment supprimée')).toHaveCount(0);
    await expect(page.getByText('Aucune note pour le moment.')).toBeVisible();
  });

  test('hors ligne, une note ajoutée n’est pas perdue au retour du réseau', async ({
    page,
    context,
  }) => {
    // CE QUE CE TEST PROUVE, ET CE QU'IL NE PROUVE PAS.
    //
    // Il prouve la promesse VISIBLE : réseau coupé, l'application répond
    // encore (service worker), le geste aboutit, il le DIT, et la note est
    // toujours là au retour — y compris après un démarrage à froid.
    //
    // Il ne prouve PAS le rejeu de la file d'écritures (ADR 0010) : le
    // squelette démarre sans configuration, ses e2e tournent donc en mode
    // local, où il n'y a pas de réseau entre l'application et son stockage —
    // et donc pas de file. Cette moitié-là est prouvée dans
    // `src/backend/queued-notes.test.ts`, contre le contrat du port. C'est
    // écrit ici pour que personne ne prenne ce test pour ce qu'il n'est pas.
    await page.goto('/');
    // En local il n'y a rien à attendre : l'indicateur n'est PAS rendu. Un
    // badge qui dirait « à jour » sans jamais rien attendre serait du décor.
    await expect(page.locator('[data-dwc="sync-status"]')).toHaveCount(0);

    await context.setOffline(true);

    const texte = `écrite hors ligne ${Date.now()}`;
    await page.getByLabel('Nouvelle note').fill(texte);
    await page.getByRole('button', { name: 'Ajouter' }).click();
    await expect(page.getByText(texte)).toBeVisible();

    // Et la coupure est ANNONCÉE : le bandeau du socle apparaît après une
    // seconde et demie hors ligne continu — les micro-coupures ne clignotent
    // pas. Sans lui, une écriture qui attend ressemble à une écriture faite.
    await expect(page.locator('[data-dwc="connection-banner"]')).toBeVisible({
      timeout: 10_000,
    });

    await context.setOffline(false);
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

    // ET LA ZONE DANGEREUSE N'EXISTE PAS. Sans backend distant, il n'y a pas
    // de compte à effacer : un bouton « Supprimer mon compte » qui n'efface
    // rien serait pire que son absence. C'est la seule moitié de l'ADR 0009
    // qu'un e2e sans configuration puisse prouver — l'effacement lui-même est
    // prouvé en pgTAP, sur une base réelle.
    await expect(page.getByTestId('zone-dangereuse')).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Supprimer mon compte' })
    ).toHaveCount(0);
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
    // DEPUIS « À PROPOS », et plus depuis les réglages : le pied de page a
    // quitté la coquille pour l'accueil et cet écran, les deux seuls que la
    // règle famille du 06/09/2026 autorise. Rendu hors des routes, il suivait
    // chaque écran — donc aussi ceux qui n'ont rien à en faire.
    await page.goto('/a-propos');
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
    expect(url.searchParams.get('environnement')).toContain('/a-propos');
  });

  test('les trois liens de la famille : sur l’accueil et « À propos », nulle part ailleurs', async ({
    page,
  }) => {
    // La règle famille du 06/09/2026, vue de l'écran. `pwa-doctor` la lit dans
    // le code (`liens-famille`) ; ce test la lit dans le rendu, où un pied de
    // page remonté dans la coquille se verrait tout de suite.
    //
    // TOUT EST PORTÉ PAR LE PIED DE PAGE, et les noms sont EXACTS : la grille
    // des applications sœurs rend seize liens « Code source de <app> », qu'une
    // recherche par sous-chaîne ramasse aussi.
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

    for (const route of ['/reglages', '/compte']) {
      await page.goto(route);
      // L'écran est bien rendu : sans cette ancre, un test qui ne trouve rien
      // passerait aussi sur une page blanche.
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(pied, `pied de page interdit sur ${route}`).toHaveCount(0);
      for (const nom of liens) {
        await expect(
          page.getByRole('link', { name: nom, exact: true }),
          `${nom} ne doit pas être sur ${route}`
        ).toHaveCount(0);
      }
    }
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
