-- Visibilidade hierárquica em contacts e deals (CRM Imobiliário):
--   owner / admin   -> toda a org
--   manager (Líder) -> só leads/deals dos membros do(s) seu(s) time(s) em team_members
--   member (Corretor) -> só os próprios (owner_id = auth.uid())
-- INSERT/UPDATE/DELETE permanecem com as políticas anteriores (não alterar).

DROP POLICY IF EXISTS "Org members can view contacts" ON public.contacts;
DROP POLICY IF EXISTS "Org members can view deals"    ON public.deals;

CREATE POLICY "contacts_select_by_role" ON contacts
  FOR SELECT USING (
    CASE
      WHEN EXISTS (
        SELECT 1 FROM user_roles
        WHERE user_id = auth.uid()
        AND org_id = contacts.org_id
        AND role IN ('owner', 'admin')
      ) THEN true

      WHEN EXISTS (
        SELECT 1 FROM user_roles ur
        JOIN team_members tm_self   ON tm_self.user_id   = auth.uid()
        JOIN team_members tm_target ON tm_target.team_id = tm_self.team_id
        WHERE ur.user_id  = auth.uid()
        AND ur.org_id     = contacts.org_id
        AND ur.role       = 'manager'
        AND contacts.owner_id = tm_target.user_id
      ) THEN true

      WHEN contacts.owner_id = auth.uid() THEN true

      ELSE false
    END
  );

CREATE POLICY "deals_select_by_role" ON deals
  FOR SELECT USING (
    CASE
      WHEN EXISTS (
        SELECT 1 FROM user_roles
        WHERE user_id = auth.uid()
        AND org_id = deals.org_id
        AND role IN ('owner', 'admin')
      ) THEN true

      WHEN EXISTS (
        SELECT 1 FROM user_roles ur
        JOIN team_members tm_self   ON tm_self.user_id   = auth.uid()
        JOIN team_members tm_target ON tm_target.team_id = tm_self.team_id
        WHERE ur.user_id  = auth.uid()
        AND ur.org_id     = deals.org_id
        AND ur.role       = 'manager'
        AND deals.owner_id = tm_target.user_id
      ) THEN true

      WHEN deals.owner_id = auth.uid() THEN true

      ELSE false
    END
  );
