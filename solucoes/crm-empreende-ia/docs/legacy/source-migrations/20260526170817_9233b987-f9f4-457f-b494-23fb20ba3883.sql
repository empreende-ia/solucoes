
INSERT INTO storage.buckets (id, name, public) VALUES ('imovel-fotos', 'imovel-fotos', true) ON CONFLICT (id) DO NOTHING;

-- Public read
CREATE POLICY "Imovel fotos publicly readable"
ON storage.objects FOR SELECT
USING (bucket_id = 'imovel-fotos');

-- Authenticated members of the org can upload (path must start with their org_id)
CREATE POLICY "Org members can upload imovel fotos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'imovel-fotos'
  AND public.user_belongs_to_org(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "Org members can update imovel fotos"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'imovel-fotos'
  AND public.user_belongs_to_org(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "Org members can delete imovel fotos"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'imovel-fotos'
  AND public.user_belongs_to_org(auth.uid(), ((storage.foldername(name))[1])::uuid)
);
