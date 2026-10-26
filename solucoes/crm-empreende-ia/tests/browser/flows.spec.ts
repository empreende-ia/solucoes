import { test, expect, type Page } from '@playwright/test';
import { IDS, installCrmFixture } from './fixture';
const choose = async (page: Page, label: string, option: string) => { await page.getByLabel(label, { exact: true }).click(); await page.getByRole('option', { name: option, exact: true }).click(); };
const yesterday = () => { const d = new Date(); d.setDate(d.getDate() - 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T10:00`; };

test('contato → oportunidade → tarefa → Hoje → concluir atualiza todas as fichas', async ({ page }) => {
  const state = await installCrmFixture(page);
  await page.goto('/contacts?action=new'); await page.getByLabel('Nome *', { exact: true }).fill('Contato'); await page.getByLabel('Sobrenome', { exact: true }).fill('do Fluxo');
  await page.getByLabel('E-mail', { exact: true }).fill('fluxo@example.test'); await page.getByRole('button', { name: 'Salvar cadastro', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Contato do Fluxo', exact: true })).toBeVisible();
  const contact = state.tables.contacts.find(c => c.email === 'fluxo@example.test')!; expect(contact.org_id).toBe(IDS.org);
  await page.goto('/pipeline?create=1'); await page.getByLabel('Nome da oportunidade *', { exact: true }).fill('Oportunidade do Fluxo');
  await choose(page, 'Responsável', 'Pessoa de Teste'); await choose(page, 'Contato', 'Contato do Fluxo');
  await page.getByRole('button', { name: 'Criar oportunidade', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Oportunidade do Fluxo', exact: true })).toBeVisible();
  const deal = state.tables.deals.find(d => d.title === 'Oportunidade do Fluxo')!; expect(deal.contact_id).toBe(contact.id);
  await page.goto('/tasks?action=new'); await page.getByLabel('Título *', { exact: true }).fill('Atividade do Fluxo'); await page.getByLabel('Prazo', { exact: true }).fill(yesterday());
  await choose(page, 'Contato', 'Contato do Fluxo'); await choose(page, 'Oportunidade', 'Oportunidade do Fluxo');
  await page.getByRole('button', { name: 'Salvar atividade', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Atividade do Fluxo', exact: true })).toBeVisible();
  const activity = state.tables.activities.find(a => a.title === 'Atividade do Fluxo')!; expect(activity.deal_id).toBe(deal.id); expect(activity.contact_id).toBe(contact.id); expect(activity.user_id).toBe(IDS.owner);
  await page.goto('/dashboard'); const card = page.locator('li').filter({ has: page.getByRole('button', { name: 'Atividade do Fluxo', exact: true }) });
  await expect(card).toHaveCount(1); await card.getByRole('button', { name: 'Concluir', exact: true }).click();
  await expect.poll(() => state.tables.activities.find(a => a.id === activity.id)?.completed_at).not.toBeNull();
  await expect(page.getByRole('button', { name: 'Atividade do Fluxo', exact: true })).toHaveCount(0);
  await page.goto(`/contacts?contact=${contact.id}`); await expect(page.getByText('Sem próxima ação com prazo.', { exact: false })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Atividade do Fluxo', exact: true })).toBeVisible(); await expect(page.getByText('Concluída', { exact: false }).first()).toBeVisible();
});

test('busca global abre cadastro exato e voltar restaura pesquisa e carteira', async ({ page }) => {
  await installCrmFixture(page); await page.goto('/contacts?q=Alfa&scope=mine&sort=updated');
  await expect(page.getByRole('button', { name: 'Contato Alfa', exact: true })).toBeVisible();
  await page.keyboard.press('Control+k'); await page.getByLabel('Buscar registros e páginas').fill('Alfa');
  await page.getByRole('button', { name: 'Contato Alfa alfa@example.test', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`contact=${IDS.contact}`)); await expect(page.getByRole('heading', { name: 'Contato Alfa', exact: true })).toBeVisible();
  await page.goBack(); await expect(page).toHaveURL(/q=Alfa&scope=mine&sort=updated/); await expect(page.getByLabel('Pesquisar por nome, e-mail, telefone ou empresa')).toHaveValue('Alfa');
  await expect(page.getByRole('button', { name: 'Minha carteira', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('mover oportunidade registra etapa por ID e histórico', async ({ page }) => {
  const state = await installCrmFixture(page); await page.goto(`/pipeline?deal=${IDS.deal}`);
  await expect(page.getByRole('heading', { name: 'Projeto Exemplo', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Mover ou alterar situação/ }).click();
  await page.getByRole('menuitem', { name: /Proposta/ }).click();
  await expect.poll(() => state.tables.deals.find(d => d.id === IDS.deal)?.stage_id).toBe(IDS.stage2);
  expect(state.tables.deal_stage_history.filter(h => h.deal_id === IDS.deal)).toHaveLength(2);
  await expect(page.getByText('Entrada → Proposta', { exact: false })).toBeVisible();
});

test('falha no cadastro conserva formulário e recuperação salva uma única vez', async ({ page }) => {
  const state = await installCrmFixture(page); state.failWrites.add('contacts'); await page.goto('/contacts?action=new');
  await page.getByLabel('Nome *', { exact: true }).fill('Cadastro Preservado'); await page.getByLabel('E-mail', { exact: true }).fill('preservado@example.test');
  await page.getByRole('button', { name: 'Salvar cadastro', exact: true }).click(); await expect(page.getByRole('alert').filter({ hasText: 'Seu preenchimento foi preservado' })).toBeVisible();
  await expect(page.getByLabel('Nome *', { exact: true })).toHaveValue('Cadastro Preservado'); await expect(page.getByLabel('E-mail', { exact: true })).toHaveValue('preservado@example.test');
  expect(state.tables.contacts.filter(c => c.email === 'preservado@example.test')).toHaveLength(0); state.failWrites.clear(); await page.getByRole('button', { name: 'Salvar cadastro', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Cadastro Preservado', exact: true })).toBeVisible(); expect(state.tables.contacts.filter(c => c.email === 'preservado@example.test')).toHaveLength(1);
});

test('ficha indisponível mantém filtros e não expõe outra organização', async ({ page }) => {
  await installCrmFixture(page); await page.goto(`/contacts?q=Alfa&scope=mine&contact=${IDS.otherContact}`);
  await expect(page.getByRole('heading', { name: 'Cadastro não encontrado ou sem acesso', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Voltar à lista', exact: true }).click(); await expect(page).toHaveURL(/q=Alfa&scope=mine/);
  await expect(page.getByText('de outra organização', { exact: false })).toHaveCount(0);
});

test('viewer pode consultar e não tem ações de gravação nas fichas e rotina', async ({ page }) => {
  const state = await installCrmFixture(page, { role: 'viewer' });
  await page.goto(`/contacts?contact=${IDS.contact}`); await expect(page.getByRole('heading', { name: 'Contato Alfa', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Editar cadastro', exact: true })).toHaveCount(0); await expect(page.getByRole('button', { name: 'Criar ação', exact: true })).toHaveCount(0);
  await page.goto(`/activities?activity=${IDS.activity}`); await expect(page.getByRole('heading', { name: 'Retorno de teste', exact: true })).toBeVisible(); await expect(page.getByRole('button', { name: 'Editar / reagendar', exact: true })).toHaveCount(0);
  await page.goto('/tasks?action=new'); await expect(page.getByRole('heading', { name: 'Acesso somente para consulta', exact: true })).toBeVisible();
  expect(state.requests.filter(r => ['PATCH', 'DELETE'].includes(r.method) || r.method === 'POST' && !['search_crm'].includes(r.table))).toHaveLength(0);
});

test('cadastro sem vínculos pode ser editado e excluído com confirmação', async ({ page }) => {
  const state = await installCrmFixture(page); await page.goto('/contacts?action=new');
  await page.getByLabel('Nome *', { exact: true }).fill('Cadastro Temporário'); await page.getByRole('button', { name: 'Salvar cadastro', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Cadastro Temporário', exact: true })).toBeVisible(); const id = state.tables.contacts.find(c => c.first_name === 'Cadastro Temporário')!.id;
  await page.getByRole('button', { name: 'Editar cadastro', exact: true }).click(); await page.getByLabel('Nome *', { exact: true }).fill('Cadastro Atualizado'); await page.getByRole('button', { name: 'Salvar cadastro', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Cadastro Atualizado', exact: true })).toBeVisible(); expect(state.tables.contacts.find(c => c.id === id)?.first_name).toBe('Cadastro Atualizado');
  await page.getByRole('button', { name: 'Excluir cadastro', exact: true }).click(); const confirmation = page.getByRole('dialog', { name: 'Excluir este cadastro?' }); await expect(confirmation).toBeVisible();
  await confirmation.getByRole('button', { name: 'Excluir cadastro', exact: true }).click(); await expect.poll(() => state.tables.contacts.some(c => c.id === id)).toBe(false); await expect(page).not.toHaveURL(/contact=/);
});

test('visão salva restaura filtros após recarregar e abrir/fechar ficha', async ({ page }) => {
  await installCrmFixture(page); await page.goto('/contacts?q=Alfa&scope=mine&sort=updated&columns=email,owner');
  await page.getByRole('button', { name: /Visões salvas/ }).click(); await page.getByRole('button', { name: 'Salvar visão atual', exact: true }).click();
  await page.getByLabel('Nome da visão', { exact: true }).fill('Carteira de teste'); await page.getByRole('button', { name: 'Salvar visão', exact: true }).click();
  await page.goto('/contacts'); await page.getByRole('button', { name: /Visões salvas/ }).click(); await page.getByRole('button', { name: 'Carteira de teste', exact: true }).click(); await page.keyboard.press('Escape');
  await expect(page.getByLabel('Pesquisar por nome, e-mail, telefone ou empresa')).toHaveValue('Alfa'); await expect(page.getByRole('button', { name: 'Minha carteira', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Contato Alfa', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Contato Alfa', exact: true })).toBeVisible(); await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/q=Alfa/); await expect(page).toHaveURL(/scope=mine/); await expect(page).toHaveURL(/columns=email%2Cowner/);
});
