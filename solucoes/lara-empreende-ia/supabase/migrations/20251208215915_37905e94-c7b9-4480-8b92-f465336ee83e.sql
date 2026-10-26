-- Atualizar estágios existentes com critérios IA
UPDATE pipeline_stages SET 
  ai_trigger_criteria = 'Estágio inicial - todo novo contato começa aqui automaticamente',
  is_ai_managed = false,
  color = 'border-slate-500'
WHERE id = 'bfef58eb-b06d-4c7e-9415-70fe52232b4a';

-- Atualizar estágio de Negociação para Fechamento
UPDATE pipeline_stages SET 
  title = 'Fechamento',
  ai_trigger_criteria = 'Negociação final - requer intervenção humana para fechar o deal',
  is_ai_managed = false,
  color = 'border-orange-500',
  position = 3
WHERE id = 'c9734797-9d12-4049-a2df-25e78749b568';

-- Atualizar estágios de sistema
UPDATE pipeline_stages SET 
  ai_trigger_criteria = 'Deal fechado com sucesso - cliente confirmou compra',
  is_ai_managed = false,
  color = 'border-green-500',
  position = 100
WHERE id = '08c13b42-d8b6-4460-b83a-a888b686a20b';

UPDATE pipeline_stages SET 
  ai_trigger_criteria = 'Deal perdido - cliente desistiu ou escolheu concorrente',
  is_ai_managed = false,
  color = 'border-red-500',
  position = 101
WHERE id = '6879711b-f783-474a-ae87-f1d6d68433bc';

-- Inserir estágios que faltam
INSERT INTO pipeline_stages (title, color, position, is_active, is_ai_managed, is_system, ai_trigger_criteria) VALUES
  ('Em Qualificação', 'border-cyan-500', 1, true, true, false, 'Mover quando: lead responde mensagens, demonstra interesse inicial, faz perguntas sobre produto/serviço, ou menciona necessidade/problema que podemos resolver'),
  ('Oportunidade', 'border-violet-500', 2, true, true, false, 'Mover quando: lead demonstra intenção de compra, pede preços/propostas/orçamentos, agenda reunião ou demonstração, ou confirma interesse em fechar negócio');