-- Drop existing restrictive policies on messages
DROP POLICY IF EXISTS "Users can access messages of their conversations" ON messages;

-- Create permissive policy for messages - all authenticated users can access
CREATE POLICY "Authenticated users can access all messages"
ON messages FOR ALL
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');

-- Drop existing restrictive policies on conversations
DROP POLICY IF EXISTS "Users can manage own conversations" ON conversations;

-- Create permissive policy for conversations - all authenticated users can access
CREATE POLICY "Authenticated users can access all conversations"
ON conversations FOR ALL
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');

-- Also update contacts for consistency
DROP POLICY IF EXISTS "Users can manage own contacts" ON contacts;

CREATE POLICY "Authenticated users can access all contacts"
ON contacts FOR ALL
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');