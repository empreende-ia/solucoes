-- 1. Fix messages RLS - users can only access messages from their conversations
DROP POLICY IF EXISTS "Allow all operations on messages" ON public.messages;
CREATE POLICY "Users can access messages of their conversations"
ON public.messages FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.conversations 
    WHERE id = messages.conversation_id 
    AND user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.conversations 
    WHERE id = messages.conversation_id 
    AND user_id = auth.uid()
  )
);

-- 2. Fix conversation_states RLS - users can only access states from their conversations
DROP POLICY IF EXISTS "Allow all operations on conversation_states" ON public.conversation_states;
CREATE POLICY "Users can access states of their conversations"
ON public.conversation_states FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.conversations 
    WHERE id = conversation_states.conversation_id 
    AND user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.conversations 
    WHERE id = conversation_states.conversation_id 
    AND user_id = auth.uid()
  )
);

-- 3. Fix deal_activities RLS - users can only access activities from their deals
DROP POLICY IF EXISTS "Allow all operations on deal_activities" ON public.deal_activities;
CREATE POLICY "Users can access activities of their deals"
ON public.deal_activities FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.deals 
    WHERE id = deal_activities.deal_id 
    AND user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.deals 
    WHERE id = deal_activities.deal_id 
    AND user_id = auth.uid()
  )
);