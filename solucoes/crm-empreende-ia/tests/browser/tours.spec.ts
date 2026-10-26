import { expect, test, type Page } from '@playwright/test';
import { IDS, installCrmFixture } from './fixture';

const routes = [
  { path: '/dashboard', id: 'dashboard' },
  { path: '/contacts', id: 'contacts' },
  { path: '/pipeline', id: 'pipeline' },
  { path: '/agenda', id: 'agenda' },
  { path: '/tasks', id: 'tasks' },
  { path: '/financeiro', id: 'financeiro' },
  { path: '/automations', id: 'automations' },
  { path: '/settings/integrations', id: 'integrations' },
];

async function expectCardInsideViewport(page: Page) {
  const card = page.locator('.product-tour-card');
  await expect(card).toBeVisible();
  await expect.poll(async () => card.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const viewport = window.visualViewport;
    const left = viewport?.offsetLeft ?? 0, top = viewport?.offsetTop ?? 0;
    const width = viewport?.width ?? window.innerWidth, height = viewport?.height ?? window.innerHeight;
    return rect.left >= left - 1 && rect.top >= top - 1 && rect.right <= left + width + 1 && rect.bottom <= top + height + 1 && element.scrollWidth <= element.clientWidth + 1;
  })).toBe(true);
}

for (const theme of ['light', 'dark'] as const) {
  for (const route of routes) {
    test(`${route.id}: voluntary guide, keyboard and 320 px in ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 568 });
      const fixture = await installCrmFixture(page, { role: 'owner', theme });
      await page.goto(route.path);
      await expect(page.locator(`[data-product-tour="${route.id}"]`)).toBeVisible();
      await expect.poll(() => page.locator('.eia-page-header').evaluate((element) => element.getBoundingClientRect().height)).toBeLessThanOrEqual(120);
      const launcher = page.locator('[data-tour-launcher]');
      await expect(launcher).toBeEnabled();
      // Wait for the actual data-backed targets, not just a create button rendered while loading.
      await expect.poll(() => page.locator('[data-tour]').evaluateAll((elements) => elements.filter((element) => element.getClientRects().length > 0).length)).toBeGreaterThanOrEqual(3);
      await expect(page.locator('.product-tour-card')).toHaveCount(0);
      await expect(page.locator('html')).toHaveAttribute('data-eia-theme', theme);
      const mutationsBefore = fixture.requests.filter((request) => !['GET', 'HEAD'].includes(request.method)).length;
      await launcher.click();
      const card = page.locator('.product-tour-card');
      await expectCardInsideViewport(page);
      await expect(card.getByRole('heading')).toBeFocused();
      const count = await card.locator('.product-tour-counter').textContent();
      expect(count).toMatch(/Passo 1 de [3-5]/);
      for (let tab = 0; tab < 9; tab++) {
        await page.keyboard.press('Tab');
        expect(await page.evaluate(() => !!document.activeElement?.closest('.product-tour-card'))).toBe(true);
      }
      let seen = 0;
      while (await card.isVisible()) {
        await expectCardInsideViewport(page);
        await expect(card.getByRole('heading')).not.toHaveText('Este item mudou de lugar');
        seen++;
        expect(seen).toBeLessThanOrEqual(5);
        const complete = card.getByRole('button', { name: 'Concluir', exact: true });
        if (await complete.isVisible()) await complete.click();
        else await card.getByRole('button', { name: 'Próximo', exact: true }).click();
      }
      expect(seen).toBeGreaterThanOrEqual(3);
      await expect(launcher).toBeFocused();
      await expect(launcher).toHaveAccessibleName('Tour desta tela');
      const visit = await page.evaluate(({ orgId, userId, tourId }) => JSON.parse(localStorage.getItem(`empreende-crm:tours:v1:${orgId}:${userId}`)!).visits[tourId], { orgId: IDS.org, userId: IDS.owner, tourId: route.id });
      expect(visit).toMatchObject({ status: 'completed', version: 1 });
      expect(fixture.requests.filter((request) => !['GET', 'HEAD'].includes(request.method)).length).toBe(mutationsBefore);
    });
  }
}

test('pause, reload, resume and restart preserve the stable contact step', async ({ page }) => {
  await installCrmFixture(page);
  await page.goto('/contacts');
  await expect(page.locator('[data-tour="contacts-list"]')).toBeVisible();
  const launcher = page.locator('[data-tour-launcher]');
  await expect(launcher).toBeEnabled();
  await launcher.click();
  const card = page.locator('.product-tour-card');
  await card.getByRole('button', { name: 'Próximo', exact: true }).click();
  const savedTitle = await card.getByRole('heading').textContent();
  await page.keyboard.press('Escape');
  await expect(card).toHaveCount(0);
  await expect(launcher).toBeFocused();
  await page.reload();
  await expect(launcher).toHaveAccessibleName('Continuar tour');
  await expect(launcher).toBeEnabled();
  await launcher.click();
  await expect(card.getByRole('heading')).toHaveText(savedTitle!);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Recomeçar tour', exact: true }).click();
  await expect(card.locator('.product-tour-counter')).toHaveText('Passo 1 de 5');
  await card.getByRole('button', { name: 'Pular tour', exact: true }).click();
  await expect(launcher).toHaveAccessibleName('Tour desta tela');
  await expect(page.getByRole('button', { name: 'Recomeçar tour', exact: true })).toHaveCount(0);
});

test('short landscape viewport and reduced motion keep the guide reachable', async ({ page }) => {
  await page.setViewportSize({ width: 568, height: 220 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await installCrmFixture(page, { theme: 'dark' });
  await page.goto('/contacts');
  await expect(page.locator('[data-tour="contacts-list"]')).toBeVisible();
  await page.locator('[data-tour-launcher]').click();
  await expectCardInsideViewport(page);
  expect(await page.locator('.product-tour-card').evaluate((element) => getComputedStyle(element).animationName)).toBe('none');
  await page.locator('.product-tour-card').getByRole('button', { name: 'Próximo', exact: true }).click();
  await expectCardInsideViewport(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('.product-tour-card')).toHaveCount(0);
});

test('viewer receives only visible permitted steps and the setup guide blocks tours', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  const fixture = await installCrmFixture(page, { role: 'viewer', theme: 'light' });
  await page.goto('/contacts');
  await expect(page.locator('[data-tour="contacts-list"]')).toBeVisible();
  await expect(page.locator('[data-tour="contacts-create"]')).toHaveCount(0);
  await page.locator('[data-tour-launcher]').click();
  const card = page.locator('.product-tour-card');
  await expect(card.locator('.product-tour-counter')).toHaveText('Passo 1 de 4');
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.dispatchEvent(new Event('empreende-crm:open-onboarding')));
  const setup = page.getByRole('dialog', { name: 'Configurar CRM', exact: true });
  await expect(setup).toBeVisible();
  await expect(card).toHaveCount(0);
  await setup.getByRole('button', { name: /Etapa 2:/ }).click();
  await expect(setup.getByRole('button', { name: 'Configurar pipeline', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(setup).toHaveCount(0);
  expect(fixture.requests.filter((request) => !['GET', 'HEAD'].includes(request.method))).toEqual([]);
});

test('Help opens the eight destinations and closes before entering a guide route', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await installCrmFixture(page);
  await page.goto('/dashboard');
  await page.getByRole('button', { name: 'Ajuda', exact: true }).click();
  const help = page.getByRole('dialog', { name: 'Ajuda do CRM', exact: true });
  await expect(help).toBeVisible();
  await expect(help.getByRole('button', { name: /^Abrir tela:/ })).toHaveCount(8);
  await help.getByRole('button', { name: 'Abrir tela: Pipeline comercial', exact: true }).click();
  await expect(page).toHaveURL(/\/pipeline$/);
  await expect(help).toHaveCount(0);
  await expect(page.locator('[data-tour-launcher]')).toBeEnabled();
  await expect(page.locator('.product-tour-card')).toHaveCount(0);
});
