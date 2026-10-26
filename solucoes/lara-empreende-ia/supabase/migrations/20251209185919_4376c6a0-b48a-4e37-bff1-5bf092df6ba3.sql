-- Primeiro, remover duplicatas mantendo apenas o registro mais recente por user_id
DELETE FROM lara_settings a
USING lara_settings b
WHERE a.user_id = b.user_id 
  AND a.user_id IS NOT NULL
  AND a.created_at < b.created_at;

-- Adicionar constraint UNIQUE na coluna user_id
ALTER TABLE lara_settings 
ADD CONSTRAINT lara_settings_user_id_unique UNIQUE (user_id);