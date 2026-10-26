-- 3. Atualizar políticas RLS para modelo single-tenant

-- DEALS: Substituir política user_id por acesso compartilhado
DROP POLICY IF EXISTS "Users can manage own deals" ON public.deals;

CREATE POLICY "Authenticated users can access all deals" 
ON public.deals 
FOR ALL 
TO authenticated 
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');

-- APPOINTMENTS: Substituir política user_id por acesso compartilhado
DROP POLICY IF EXISTS "Users can manage own appointments" ON public.appointments;

CREATE POLICY "Authenticated users can access all appointments" 
ON public.appointments 
FOR ALL 
TO authenticated 
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');