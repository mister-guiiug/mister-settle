import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { expectNoA11yViolations } from '@mister-guiiug/dev-pwa-config/playwright-a11y';

/**
 * LE CŒUR DE L'APP : UNE DÉPENSE ENTRE, ON LIT QUI DOIT COMBIEN.
 *
 * `expenses.spec.ts` et `settlements.spec.ts` passent à DEUX, et c'est
 * toujours la personne qui crée l'espace qui paie : le payeur par défaut. Une
 * répartition à deux ne départage rien — chacun doit à l'autre — et le
 * sélecteur de payeur n'y est jamais touché. Ici, trois personnes, un autre
 * payeur, un montant à virgule : la dette se lit par personne, et la
 * suggestion de remboursement dit QUI paie QUI.
 *
 * L'audit axe ne passait que sur l'accueil. Il passe ici sur les trois pas du
 * formulaire de dépense (erreurs comprises) et sur les deux écrans du solde,
 * dans les DEUX thèmes : le Chromium de Playwright se déclare en clair, et une
 * app qui suit le système n'aurait sinon jamais été auditée en sombre.
 *
 * MODE LOCAL, comme toute la suite (ADR 0004) : le serveur de test est bâti
 * sans `VITE_SUPABASE_*`, l'app écrit sur l'appareil et rien ne sort. Pas de
 * réseau à simuler — c'est la propriété que l'app doit garder.
 */

/** Un espace à trois : Alice (moi), Bob et Chloé. */
async function espaceATrois(page: Page) {
  await page.goto('/espaces/nouveau');
  await page.getByLabel('Nom', { exact: true }).fill('Week-end');
  await page.getByLabel('Mon nom dans cet espace').fill('Alice');
  await page.getByRole('button', { name: 'Créer l’espace' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Week-end');

  await page.getByRole('link', { name: 'Personnes' }).click();
  for (const nom of ['Bob', 'Chloé']) {
    await page.getByRole('button', { name: 'Ajouter une personne' }).click();
    await page.getByLabel('Nom affiché').fill(nom);
    await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
    await expect(page.getByText(nom, { exact: true })).toBeVisible();
  }
  await expect(page.getByText('3 personnes')).toBeVisible();
}

async function ouvrirNouvelleDepense(page: Page) {
  await page.getByRole('link', { name: 'Dépenses' }).click();
  await page.getByRole('link', { name: 'Nouvelle dépense' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Nouvelle dépense'
  );
}

/** Le pas affiché par l'assistant, seul repère de progression lisible. */
const pas = (page: Page, n: number) =>
  page.getByText(new RegExp(`^Étape ${n} sur 3`));

/** Bob avance 45,90 € de courses pour les trois. */
async function saisirCourses(page: Page) {
  await page.getByLabel('Libellé').fill('Courses');
  await page.getByLabel('Montant (EUR)').fill('45,90');
  await page.getByRole('button', { name: 'Continuer' }).click();
  await expect(pas(page, 2)).toBeVisible();
  await page
    .getByRole('combobox', { name: 'Qui a payé ?' })
    .selectOption({ label: 'Bob' });
  await expect(page.getByText('Personnes retenues (3)')).toBeVisible();
}

/** La ligne d'une personne à l'écran des soldes. */
const solde = (page: Page, nom: string) =>
  page.getByRole('listitem').filter({
    has: page.getByText(nom, { exact: true }),
  });

test.describe('@critical une dépense à trois', () => {
  test('Bob avance 45,90 € pour trois : Alice et Chloé lui doivent 15,30 € chacune', async ({
    page,
  }) => {
    await espaceATrois(page);
    await ouvrirNouvelleDepense(page);
    await saisirCourses(page);
    await page.getByRole('button', { name: 'Continuer' }).click();
    await expect(pas(page, 3)).toBeVisible();
    await expect(page.getByText('Par personne')).toBeVisible();
    await page
      .getByRole('button', { name: 'Valider cette répartition' })
      .click();
    await expect(page.getByText('Validée', { exact: true })).toBeVisible();

    // Les soldes : Bob a avancé 45,90 et n'en doit que le tiers.
    await page.getByRole('link', { name: 'Soldes' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Soldes');
    // `\s` : Intl sépare le montant du symbole par une espace insécable.
    await expect(solde(page, 'Bob')).toContainText(
      /payé 45,90\s€ · dû 15,30\s€/
    );
    await expect(solde(page, 'Bob')).toContainText(/30,60\s€/);
    for (const nom of ['Alice', 'Chloé']) {
      await expect(solde(page, nom)).toContainText(/payé 0,00\s€ · dû 15,30/);
      await expect(solde(page, nom)).toContainText(/-15,30\s€/);
    }

    // Qui doit combien, à qui : deux remboursements, tous deux vers Bob.
    await page
      .getByRole('link', { name: 'Régler avec les suggestions' })
      .click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Remboursements'
    );
    const suggestions = page
      .getByRole('listitem')
      .filter({ hasText: /reçoit/ });
    await expect(suggestions).toHaveCount(2);
    for (const nom of ['Alice', 'Chloé']) {
      await expect(suggestions.filter({ hasText: nom })).toHaveText(
        new RegExp(`${nom}\\s*paie\\s*15,30\\s€\\s*Bob\\s*reçoit`)
      );
    }

    // Ce qui est lu survit à un démarrage à froid.
    await page.reload();
    await expect(suggestions).toHaveCount(2);
  });
});

for (const theme of ['light', 'dark'] as const) {
  test.describe(`@a11y dépense et solde — thème ${theme === 'light' ? 'clair' : 'sombre'}`, () => {
    // Le thème suit le système tant que rien n'est choisi : émuler la
    // préférence suffit, et c'est ce que vit un visiteur en mode sombre.
    test.use({ colorScheme: theme });

    test('le formulaire de dépense, pas à pas, sans violation WCAG A/AA', async ({
      page,
    }) => {
      await espaceATrois(page);
      await ouvrirNouvelleDepense(page);
      // Le thème est bien celui qu'on croit auditer.
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);

      // Pas 1, vierge puis en erreur : les messages rouges sont l'endroit
      // classique où un contraste lâche.
      await expect(pas(page, 1)).toBeVisible();
      await expectNoA11yViolations(page, AxeBuilder, expect);
      await page.getByRole('button', { name: 'Continuer' }).click();
      await expect(page.getByText('Un libellé est nécessaire.')).toBeVisible();
      await expectNoA11yViolations(page, AxeBuilder, expect);

      // Pas 2 : payeur, bénéficiaires, modèle de répartition.
      await saisirCourses(page);
      await expectNoA11yViolations(page, AxeBuilder, expect);

      // Pas 3 : la synthèse et l'impact sur les soldes.
      await page.getByRole('button', { name: 'Continuer' }).click();
      await expect(page.getByText('Par personne')).toBeVisible();
      await expectNoA11yViolations(page, AxeBuilder, expect);
    });

    test('les soldes et les remboursements suggérés sans violation WCAG A/AA', async ({
      page,
    }) => {
      await espaceATrois(page);
      await ouvrirNouvelleDepense(page);
      await saisirCourses(page);
      await page.getByRole('button', { name: 'Continuer' }).click();
      await page
        .getByRole('button', { name: 'Valider cette répartition' })
        .click();
      await expect(page.getByText('Validée', { exact: true })).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);

      await page.getByRole('link', { name: 'Soldes' }).click();
      await expect(solde(page, 'Bob')).toContainText(/30,60\s€/);
      await expectNoA11yViolations(page, AxeBuilder, expect);

      await page
        .getByRole('link', { name: 'Régler avec les suggestions' })
        .click();
      await expect(
        page.getByRole('listitem').filter({ hasText: /reçoit/ })
      ).toHaveCount(2);
      await expectNoA11yViolations(page, AxeBuilder, expect);
    });
  });
}
