import { test, expect } from '@playwright/test';
import { installCrmFixture } from './fixture';

const routes = [
  ['/dashboard', 'Hoje', 'Próximos passos do dia', 'activities'],
  ['/contacts', 'Contatos', 'Relacionamentos que movem o negócio', 'contacts'],
  ['/companies', 'Empresas', 'Sua rede de empresas', 'companies'],
  ['/pipeline', 'Pipeline', 'Projeto Exemplo', 'deals'],
  ['/activities', 'Atividades', 'O trabalho conectado ao relacionamento', 'activities'],
  ['/tasks', 'Tarefas', 'Cada tarefa com um próximo passo', 'activities'],
  ['/agenda', 'Agenda', 'Tempo reservado para boas conversas', 'activities'],
  ['/financeiro', 'Financeiro', 'Recebimentos com contexto.', 'payments'],
  ['/reports', 'Relatórios', 'Previsão ponderada', 'deals'],
  ['/automations', 'Automações', 'Retorno após criação', 'automations'],
  ['/templates', 'Modelos', 'Modelo de exemplo', 'email_templates'],
  ['/team', 'Equipe', 'Convidar uma pessoa', 'invitations'],
  ['/settings', 'Configurações', 'Seu nome', 'organizations'],
  ['/settings/integrations', 'Integrações', 'Contatos por CSV', 'integration_configs'],
  ['/settings/security', 'Segurança', 'Histórico de alterações', 'audit_logs'],
] as const;
for (const [path, title, text] of routes) {
  test(`render ${path}`, async ({ page }) => {
    await installCrmFixture(page); const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(path); await expect(page.getByRole('heading', { level: 1, name: title, exact: true })).toBeVisible();
    await expect(page.getByText(text, { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/Algo deu errado|Falha ao carregar o aplicativo/)).toHaveCount(0); expect(errors).toEqual([]);
    await expect(page.getByText('de outra organização', { exact: false })).toHaveCount(0);
  });
}
for (const [path, , , table] of routes) {
  test(`erro e recuperação ${path}`, async ({ page }) => {
    const state = await installCrmFixture(page); state.failReads.add(table);
    await page.goto(path === '/settings' ? '/settings?tab=organization' : path); await expect(page.getByText(/Não foi possível|Falha ao/).first()).toBeVisible({ timeout: 20_000 });
    const retry = page.getByRole('button', { name: 'Tentar novamente', exact: true }).first();
    await expect(retry).toBeVisible(); state.failReads.clear(); await retry.click();
    await expect(page.getByText(/Não foi possível|Falha ao/).first()).not.toBeVisible({ timeout: 20_000 });
  });
}
for (const theme of ['light', 'dark'] as const) {
  for (const viewport of [{ width: 320, height: 740 }, { width: 1440, height: 1000 }]) {
    test(`layout ${theme} ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport); await installCrmFixture(page, { theme });
      for (const [path, title] of routes) {
        await page.goto(path); await expect(page.getByRole('heading', { level: 1, name: title, exact: true })).toBeVisible();
        const geometry = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
        expect(geometry.scroll, `${path} document overflow`).toBeLessThanOrEqual(geometry.width + 1);
        expect(geometry.body, `${path} body overflow`).toBeLessThanOrEqual(geometry.width + 1);
      }
      await page.goto('/contacts'); await expect(page.getByText('Contato Alfa', { exact: true })).toBeVisible();
      await page.screenshot({ path: `/tmp/crm-qa/contacts-${theme}-${viewport.width}.png`, fullPage: true });
      await page.goto('/dashboard'); await expect(page.getByText('Próximos passos do dia', { exact: true })).toBeVisible();
      await page.screenshot({ path: `/tmp/crm-qa/today-${theme}-${viewport.width}.png`, fullPage: true });
    });
  }
}
