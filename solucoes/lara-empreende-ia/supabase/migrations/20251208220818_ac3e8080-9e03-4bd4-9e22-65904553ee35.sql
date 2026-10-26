-- Habilitar REPLICA IDENTITY FULL para capturar todas as mudanças
ALTER TABLE deals REPLICA IDENTITY FULL;
ALTER TABLE pipeline_stages REPLICA IDENTITY FULL;

-- Adicionar tabelas à publicação realtime
ALTER PUBLICATION supabase_realtime ADD TABLE deals;
ALTER PUBLICATION supabase_realtime ADD TABLE pipeline_stages;