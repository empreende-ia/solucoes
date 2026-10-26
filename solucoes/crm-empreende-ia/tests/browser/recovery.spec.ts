import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { createFixture, IDS, installCrmFixture, type FixtureRow, type FixtureState } from './fixture';

const importDialog = (page: Page) => page.getByRole('dialog', { name: 'Revisar importação' });
const posts = (state: FixtureState) => state.requests.filter(request => request.table === 'contacts' && request.method === 'POST');
const writtenRows = (request: FixtureState['requests'][number]) => request.body as FixtureRow[];
async function openCsv(page: Page, lines: string[]) {
  await page.goto('/settings/integrations');
  await page.getByLabel('Importar arquivo CSV (até 500 contatos)', { exact: true }).setInputFiles({
    name: 'contatos-recuperacao.csv', mimeType: 'text/csv', buffer: Buffer.from(['first_name,last_name,email,phone', ...lines].join('\r\n')),
  });
  await expect(importDialog(page)).toBeVisible();
}

test('CSV recupera concorrência de e-mail sem sobrescrever e mantém o ID dos contatos restantes', async ({ page }) => {
  const state = await installCrmFixture(page);
  await openCsv(page, ['Contato,Novo,novo@example.test,', 'Contato,Concorrente,corrida@example.test,']);
  const dialog = importDialog(page);
  await expect(dialog.getByText(/2 novos contatos/)).toBeVisible();
  let raceInserted = false;
  const concurrentId = randomUUID();
  // Another writer commits after the preflight GET and before this client's POST.
  // The ordinary fixture then enforces atomic email uniqueness for the entire bulk insert.
  await page.route('http://127.0.0.1:54329/rest/v1/contacts**', async route => {
    if (route.request().method() === 'POST' && !raceInserted) {
      raceInserted = true;
      state.tables.contacts.push({ ...state.tables.contacts[0], id: concurrentId, first_name: 'Cadastro concorrente', last_name: null, email: 'CORRIDA@example.test' });
    }
    await route.fallback();
  });
  await dialog.getByRole('button', { name: 'Confirmar importação de 2 contatos', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Outro cadastro passou a usar um e-mail');
  expect(posts(state)).toHaveLength(1);
  const originalRows = writtenRows(posts(state)[0]);
  expect(state.tables.contacts.some(row => row.email === 'novo@example.test')).toBe(false);
  expect(state.tables.contacts.find(row => row.id === concurrentId)?.first_name).toBe('Cadastro concorrente');

  await dialog.getByRole('button', { name: 'Confirmar importação de 2 contatos', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('A prévia foi atualizada');
  await expect(dialog.getByText(/1 novos contatos/)).toBeVisible();
  await expect(dialog.getByText('corrida@example.test', { exact: true })).toHaveCount(0);
  expect(posts(state)).toHaveLength(1); // Updated preview still requires a new explicit confirmation.
  await dialog.getByRole('button', { name: 'Confirmar importação de 1 contatos', exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(posts(state)).toHaveLength(2);
  const retried = writtenRows(posts(state)[1]);
  expect(retried).toHaveLength(1);
  expect(retried[0].id).toBe(originalRows.find(row => row.email === 'novo@example.test')!.id);
  expect(state.tables.contacts.filter(row => row.email === 'novo@example.test')).toHaveLength(1);
  expect(state.tables.contacts.filter(row => String(row.email).toLowerCase() === 'corrida@example.test')).toHaveLength(1);
  expect(state.tables.contacts.find(row => row.id === concurrentId)?.first_name).toBe('Cadastro concorrente');
});

test('CSV reconhece commit com resposta perdida inclusive contato sem e-mail, sem duplicar IDs', async ({ page }) => {
  const state = await installCrmFixture(page);
  await openCsv(page, ['Contato,Sem email,,', 'Contato,Com email,confirmacao@example.test,']);
  state.loseNextWriteResponse.add('contacts');
  const dialog = importDialog(page);
  await dialog.getByRole('button', { name: 'Confirmar importação de 2 contatos', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('A importação não foi confirmada');
  expect(posts(state)).toHaveLength(1);
  const committed = writtenRows(posts(state)[0]);
  expect(committed).toHaveLength(2);
  for (const row of committed) expect(state.tables.contacts.filter(existing => existing.id === row.id)).toHaveLength(1);
  expect(committed.some(row => row.email === null)).toBe(true);
  expect(new URLSearchParams(posts(state)[0].params).get('on_conflict')).toBe('id');

  await dialog.getByRole('button', { name: 'Confirmar importação de 2 contatos', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Todos os contatos desta prévia já estão cadastrados');
  await expect(dialog.getByRole('button', { name: 'Confirmar importação de 0 contatos', exact: true })).toBeDisabled();
  expect(posts(state)).toHaveLength(1); // Reconciliation reads IDs instead of issuing another write.
  for (const row of committed) expect(state.tables.contacts.filter(existing => existing.id === row.id)).toHaveLength(1);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await page.goto('/contacts?q=Contato');
  await expect(page.getByRole('button', { name: 'Contato Sem email', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Contato Com email', exact: true })).toBeVisible();
});

test('Settings carrega mais de 500 funis e etapas e edita a etapa da segunda página pelo ID', async ({ page }) => {
  const state = createFixture();
  const id = (prefix: string, index: number) => `${prefix}-0000-4000-8000-${String(index).padStart(12, '0')}`;
  const lastPipelineId = id('90000000', 500);
  for (let index = 1; index <= 500; index++) state.tables.pipelines.push({
    ...state.tables.pipelines[0], id: id('90000000', index), name: `Funil ${String(index).padStart(3, '0')}`, is_default: false,
  });
  for (let index = 1; index <= 501; index++) state.tables.pipeline_stages.push({
    ...state.tables.pipeline_stages[0], id: id('91000000', index), pipeline_id: lastPipelineId,
    name: `Etapa ${String(index).padStart(3, '0')}`, order: index - 1,
  });
  await installCrmFixture(page, { state });
  await page.goto('/settings?tab=pipelines');
  const selector = page.getByRole('combobox', { name: 'Funil', exact: true });
  await expect(selector.locator('option')).toHaveCount(501);
  await selector.selectOption(lastPipelineId);
  await expect(page.getByRole('button', { name: 'Editar Etapa 501', exact: true })).toBeVisible();
  for (const table of ['pipelines', 'pipeline_stages']) {
    const ranges = state.requests.filter(request => request.table === table && request.method === 'GET').map(request => new URLSearchParams(request.params));
    expect(ranges.some(params => params.get('offset') === '0' && params.get('limit') === '500')).toBe(true);
    expect(ranges.some(params => params.get('offset') === '500' && params.get('limit') === '500')).toBe(true);
    expect(ranges.filter(params => params.get('limit') === '500').every(params => params.get('org_id') === `eq.${IDS.org}`)).toBe(true);
  }
  await page.getByRole('button', { name: 'Editar Etapa 501', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Configurar etapa' });
  await editor.getByLabel('Nome', { exact: true }).fill('Etapa final revisada');
  await editor.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(editor).toBeHidden();
  await expect(page.getByRole('button', { name: 'Editar Etapa final revisada', exact: true })).toBeVisible();
  expect(state.tables.pipeline_stages.find(row => row.id === id('91000000', 501))).toMatchObject({ name: 'Etapa final revisada', pipeline_id: lastPipelineId, org_id: IDS.org });
  expect(state.requests.filter(request => request.table === 'pipeline_stages' && request.method === 'PATCH')).toHaveLength(1);
});

test('colaborador conclui e reabre atividade sem receber ação de exclusão', async ({ page }) => {
  const state = await installCrmFixture(page, { role: 'member' });
  await page.goto(`/activities?activity=${IDS.activity}`);
  const detail = page.getByRole('dialog', { name: 'Retorno de teste' });
  await expect(detail).toBeVisible();
  await expect(detail.getByRole('button', { name: 'Editar / reagendar', exact: true })).toBeVisible();
  await expect(detail.getByRole('button', { name: 'Excluir', exact: true })).toHaveCount(0);
  await detail.getByRole('button', { name: 'Concluir', exact: true }).click();
  await expect(detail.getByRole('button', { name: 'Reabrir', exact: true })).toBeVisible();
  expect(state.tables.activities.find(row => row.id === IDS.activity)?.completed_at).not.toBeNull();
  await detail.getByRole('button', { name: 'Reabrir', exact: true }).click();
  await expect(detail.getByRole('button', { name: 'Concluir', exact: true })).toBeVisible();
  expect(state.tables.activities.find(row => row.id === IDS.activity)?.completed_at).toBeNull();
  expect(state.requests.filter(request => request.method === 'DELETE')).toHaveLength(0);
  expect(state.tables.activities.filter(row => row.id === IDS.activity)).toHaveLength(1);
});


test('edição de atividade detecta conclusão concorrente e preserva o rascunho', async ({ page }) => {
  const state = await installCrmFixture(page);
  await page.goto(`/activities?activity=${IDS.activity}`);
  const detail = page.getByRole('dialog', { name: 'Retorno de teste' });
  await expect(detail).toBeVisible();
  await detail.getByRole('button', { name: 'Editar / reagendar', exact: true }).click();
  await page.getByLabel('Título *', { exact: true }).fill('Meu rascunho preservado');
  const activity = state.tables.activities.find(row => row.id === IDS.activity)!;
  const completed = new Date().toISOString();
  activity.completed_at = completed;
  activity.updated_at = completed;
  await page.getByRole('button', { name: 'Salvar atividade', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Esta atividade mudou' })).toBeVisible();
  await expect(page.getByLabel('Título *', { exact: true })).toHaveValue('Meu rascunho preservado');
  expect(activity.completed_at).toBe(completed);
  expect(activity.title).toBe('Retorno de teste');
});
