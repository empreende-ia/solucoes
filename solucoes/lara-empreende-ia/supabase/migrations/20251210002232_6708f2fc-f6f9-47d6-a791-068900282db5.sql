-- Limpar dados órfãos (sem user_id) criados por migrações antigas
-- Isso evita duplicação de pipeline_stages após remix

DELETE FROM pipeline_stages WHERE user_id IS NULL;
DELETE FROM tag_definitions WHERE user_id IS NULL;
DELETE FROM lara_settings WHERE user_id IS NULL;
DELETE FROM teams WHERE user_id IS NULL;
DELETE FROM team_functions WHERE user_id IS NULL;