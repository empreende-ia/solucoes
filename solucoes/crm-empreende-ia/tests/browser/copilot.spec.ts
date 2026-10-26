import { expect, test, type Page } from '@playwright/test';
import { IDS, installCrmFixture, type FixtureState } from './fixture';

const writes = (state: FixtureState) => state.requests.filter(request => ['POST', 'PATCH', 'DELETE'].includes(request.method) && request.table !== 'search_crm');

async function openCopilot(page: Page) {
  await page.getByRole('button', { name: 'Abrir Copiloto', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Copiloto de rotina', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'O que não está confirmado', exact: true })).toBeVisible();
  return dialog;
}

async function staleOpportunity(page: Page) {
  const dialog = await openCopilot(page);
  await dialog.getByRole('button', { name: 'Quais oportunidades estão paradas?', exact: true }).click();
  const evidence = dialog.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Projeto Exemplo', exact: true }) });
  await expect(evidence).toBeVisible();
  await expect(evidence.locator('p').filter({ hasText: /^Registrado:/ })).toContainText(/sem atualização/i);
  return { dialog, evidence };
}

test('fonte do Copilot abre o contato exato e voltar conserva os filtros sem gravar', async ({ page }) => {
  const state = await installCrmFixture(page);
  await page.goto('/contacts?q=Alfa&scope=mine&sort=updated');
  await expect(page.getByRole('button', { name: 'Contato Alfa', exact: true })).toBeVisible();
  const dialog = await openCopilot(page);
  await dialog.getByLabel('Pergunta ao copiloto').fill('Contato Alfa');
  await dialog.getByRole('button', { name: 'Analisar', exact: true }).click();
  const evidence = dialog.getByRole('article');
  await expect(evidence).toHaveCount(1);
  await expect(evidence.getByRole('heading')).toHaveText('Contato Alfa');
  await expect(evidence).toContainText('Situação registrada: lead. Há um responsável definido.');
  const source = evidence.getByRole('link', { name: 'Ver registro de origem', exact: true });
  await expect(source).toHaveAttribute('href', `/contacts?contact=${IDS.contact}`);
  await source.click();
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`/contacts\\?contact=${IDS.contact}$`));
  await expect(page.getByRole('heading', { name: 'Contato Alfa', exact: true })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/q=Alfa&scope=mine&sort=updated$/);
  await expect(page.getByLabel('Pesquisar por nome, e-mail, telefone ou empresa')).toHaveValue('Alfa');
  await expect(page.getByRole('button', { name: 'Minha carteira', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(writes(state)).toEqual([]);
});

test('sugestão mostra a evidência, abre revisão preenchida e cancelar não grava', async ({ page }) => {
  const state = await installCrmFixture(page);
  const initialActivities = structuredClone(state.tables.activities);
  await page.goto('/contacts');
  await expect(page.getByRole('button', { name: 'Contato Alfa', exact: true })).toBeVisible();
  const { dialog, evidence } = await staleOpportunity(page);
  await expect(dialog).toContainText('As sugestões são inferências operacionais para sua revisão; não são compromissos já combinados com o cliente.');
  const recordedFact = (await evidence.locator('p').filter({ hasText: /^Registrado:/ }).innerText()).replace(/^Registrado:\s*/, '');
  await evidence.getByRole('button', { name: 'Revisar atividade sugerida', exact: true }).click();
  const review = page.getByRole('dialog', { name: 'Nova atividade', exact: true });
  await expect(review).toBeVisible();
  await expect(review.getByLabel('Título *', { exact: true })).toHaveValue('Definir próximo passo: Projeto Exemplo');
  await expect(review.getByLabel('Detalhes', { exact: true })).toHaveValue(`Sugestão para revisão da equipe. Motivo observado: ${recordedFact}`);
  await expect(review.getByLabel('Tipo', { exact: true })).toHaveText('Tarefa');
  await expect(review.getByLabel('Oportunidade', { exact: true })).toHaveText('Projeto Exemplo');
  await expect(review.getByLabel('Prazo', { exact: true })).toHaveValue('');
  expect(writes(state)).toEqual([]);
  await review.getByLabel('Título *', { exact: true }).fill('Rascunho descartado pela pessoa');
  await review.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(review).toHaveCount(0);
  expect(state.tables.activities).toEqual(initialActivities);
  expect(writes(state)).toEqual([]);
  const reopened = await staleOpportunity(page);
  await reopened.evidence.getByRole('link', { name: 'Ver registro de origem', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/pipeline\\?deal=${IDS.deal}$`));
  await expect(page.getByRole('heading', { name: 'Projeto Exemplo', exact: true })).toBeVisible();
  expect(writes(state)).toEqual([]);
});

test('revisão conserva alterações na falha e salva uma única atividade vinculada após tentar novamente', async ({ page }) => {
  const state = await installCrmFixture(page);
  const initialCount = state.tables.activities.length;
  await page.goto('/contacts');
  await expect(page.getByRole('button', { name: 'Contato Alfa', exact: true })).toBeVisible();
  const { evidence } = await staleOpportunity(page);
  await evidence.getByRole('button', { name: 'Revisar atividade sugerida', exact: true }).click();
  const review = page.getByRole('dialog', { name: 'Nova atividade', exact: true });
  const title = 'Revisar escopo com a equipe';
  const body = 'Objetivo revisado: confirmar internamente o próximo passo antes de falar com o contato.';
  await review.getByLabel('Título *', { exact: true }).fill(title);
  await review.getByLabel('Detalhes', { exact: true }).fill(body);
  await review.getByLabel('Prazo', { exact: true }).fill('2030-02-11T14:30');
  expect(writes(state)).toEqual([]);
  state.failWrites.add('activities');
  await review.getByRole('button', { name: 'Salvar atividade', exact: true }).click();
  await expect(review.getByRole('alert')).toBeVisible();
  await expect(review.getByLabel('Título *', { exact: true })).toHaveValue(title);
  await expect(review.getByLabel('Detalhes', { exact: true })).toHaveValue(body);
  await expect(review.getByLabel('Prazo', { exact: true })).toHaveValue('2030-02-11T14:30');
  await expect(review.getByLabel('Oportunidade', { exact: true })).toHaveText('Projeto Exemplo');
  expect(state.tables.activities).toHaveLength(initialCount);
  state.failWrites.delete('activities');
  await review.getByRole('button', { name: 'Salvar atividade', exact: true }).click();
  await expect(review).toHaveCount(0);
  const created = state.tables.activities.filter(activity => activity.title === title);
  expect(created).toHaveLength(1);
  expect(state.tables.activities).toHaveLength(initialCount + 1);
  expect(created[0]).toMatchObject({ org_id: IDS.org, deal_id: IDS.deal, type: 'task', user_id: IDS.owner, created_by: IDS.owner, body, due_date: '2030-02-11T17:30:00.000Z', completed_at: null });
  expect(writes(state).map(({ method, table }) => ({ method, table }))).toEqual([{ method: 'POST', table: 'activities' }, { method: 'POST', table: 'activities' }]);
  await page.goto(`/activities?activity=${created[0].id}`);
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  await expect(page.getByText(body, { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Projeto Exemplo', exact: true })).toHaveAttribute('href', `/pipeline?deal=${IDS.deal}`);
});

test('falha ao atualizar oculta análise antiga, permite recuperar e explicita pergunta sem evidência', async ({ page }) => {
  const state = await installCrmFixture(page);
  await page.goto('/contacts');
  await expect(page.getByRole('button', { name: 'Contato Alfa', exact: true })).toBeVisible();
  const { dialog, evidence } = await staleOpportunity(page);
  state.failReads.add('deals');
  await dialog.getByRole('button', { name: 'Atualizar análise', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Não há uma análise confiável disponível agora.', { timeout: 20_000 });
  await expect(dialog.getByRole('article')).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Revisar atividade sugerida', exact: true })).toHaveCount(0);
  state.failReads.delete('deals');
  await dialog.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await expect(evidence).toBeVisible();
  await dialog.getByLabel('Pergunta ao copiloto').fill('Qual acordo verbal foi feito ontem?');
  await dialog.getByRole('button', { name: 'Analisar', exact: true }).click();
  await expect(dialog).toContainText('Não encontrei contatos ou oportunidades com esse nome, nem reconheci uma pergunta de rotina suportada.');
  await expect(dialog).toContainText('Não conheço conversas, acordos ou pagamentos que não estejam registrados no CRM.');
  await expect(dialog.getByRole('article')).toHaveCount(0);
  await expect(dialog.getByRole('link', { name: 'Ver registro de origem', exact: true })).toHaveCount(0);
  expect(writes(state)).toEqual([]);
});

test('viewer consulta evidência e origem sem receber ação para gravar sugestão', async ({ page }) => {
  const state = await installCrmFixture(page, { role: 'viewer' });
  await page.goto('/contacts');
  await expect(page.getByRole('button', { name: 'Contato Alfa', exact: true })).toBeVisible();
  const { dialog, evidence } = await staleOpportunity(page);
  await expect(evidence).toContainText('Seu papel permite consulta. Peça a um colaborador para registrar a ação.');
  await expect(dialog.getByRole('button', { name: 'Revisar atividade sugerida', exact: true })).toHaveCount(0);
  await evidence.getByRole('link', { name: 'Ver registro de origem', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/pipeline\\?deal=${IDS.deal}$`));
  await expect(page.getByRole('heading', { name: 'Projeto Exemplo', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Mover ou alterar situação/ })).toBeDisabled();
  await expect(page.getByText('Seu papel permite consultar as oportunidades. Solicite a um administrador acesso para editar.', { exact: true })).toBeVisible();
  expect(writes(state)).toEqual([]);
});
