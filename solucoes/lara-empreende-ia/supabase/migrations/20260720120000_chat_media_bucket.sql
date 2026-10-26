-- Mídia recebida via Zernio expira no lado deles em poucos dias (verificado
-- 20/jul: 404 autenticado para anexos de 5 dias). O zernio-webhook baixa o
-- anexo na chegada e persiste aqui; a zernio-media serve do bucket primeiro.
-- Bucket PRIVADO: sem policies de leitura — todo acesso passa pelo proxy
-- autenticado (service role bypassa RLS para ler/escrever).
insert into storage.buckets (id, name, public)
values ('chat-media', 'chat-media', false)
on conflict (id) do nothing;
