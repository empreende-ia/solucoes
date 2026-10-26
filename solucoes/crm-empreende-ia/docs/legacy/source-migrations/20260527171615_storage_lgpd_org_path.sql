-- Storage LGPD: isolar buckets medical-attachments e patient-photos por org_id.
-- Convenção de path: {org_id}/... — o primeiro segmento DEVE ser o UUID da organização.
-- Substitui as policies abertas criadas em 20260526190000_health_schema_remix.sql.

DROP POLICY IF EXISTS "Authenticated org members can upload medical attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated org members can read medical attachments"   ON storage.objects;
DROP POLICY IF EXISTS "Authenticated org members can upload patient photos"      ON storage.objects;
DROP POLICY IF EXISTS "Authenticated org members can read patient photos"        ON storage.objects;

-- medical-attachments ---------------------------------------------------------

CREATE POLICY "medical_attachments_select"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'medical-attachments'
  AND public.user_belongs_to_org(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "medical_attachments_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'medical-attachments'
  AND public.user_belongs_to_org(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "medical_attachments_update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'medical-attachments'
  AND public.user_belongs_to_org(auth.uid(), ((storage.foldername(name))[1])::uuid)
)
WITH CHECK (
  bucket_id = 'medical-attachments'
  AND public.user_belongs_to_org(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "medical_attachments_delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'medical-attachments'
  AND public.user_belongs_to_org(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

-- patient-photos --------------------------------------------------------------

CREATE POLICY "patient_photos_select"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'patient-photos'
  AND public.user_belongs_to_org(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "patient_photos_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'patient-photos'
  AND public.user_belongs_to_org(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "patient_photos_update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'patient-photos'
  AND public.user_belongs_to_org(auth.uid(), ((storage.foldername(name))[1])::uuid)
)
WITH CHECK (
  bucket_id = 'patient-photos'
  AND public.user_belongs_to_org(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "patient_photos_delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'patient-photos'
  AND public.user_belongs_to_org(auth.uid(), ((storage.foldername(name))[1])::uuid)
);
