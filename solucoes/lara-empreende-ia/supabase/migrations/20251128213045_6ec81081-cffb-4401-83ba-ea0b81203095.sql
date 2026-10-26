-- Create enum for member roles
CREATE TYPE public.member_role AS ENUM ('admin', 'manager', 'agent');

-- Create enum for member status
CREATE TYPE public.member_status AS ENUM ('active', 'invited', 'disabled');

-- Create teams table
CREATE TABLE public.teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  color TEXT DEFAULT '#3b82f6',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create team_functions table
CREATE TABLE public.team_functions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create team_members table
CREATE TABLE public.team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role public.member_role NOT NULL DEFAULT 'agent',
  status public.member_status NOT NULL DEFAULT 'invited',
  avatar TEXT,
  team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  function_id UUID REFERENCES public.team_functions(id) ON DELETE SET NULL,
  weight INTEGER DEFAULT 1,
  last_active TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_functions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (permissive for now)
CREATE POLICY "Allow all operations on teams" ON public.teams
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations on team_functions" ON public.team_functions
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations on team_members" ON public.team_members
  FOR ALL USING (true) WITH CHECK (true);

-- Create triggers for updated_at
CREATE TRIGGER update_teams_updated_at
  BEFORE UPDATE ON public.teams
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_team_functions_updated_at
  BEFORE UPDATE ON public.team_functions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_team_members_updated_at
  BEFORE UPDATE ON public.team_members
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default teams
INSERT INTO public.teams (name, description, color) VALUES
  ('Vendas', 'Equipe de vendas e prospecção', '#3b82f6'),
  ('Suporte', 'Equipe de atendimento ao cliente', '#10b981'),
  ('Marketing', 'Equipe de marketing e comunicação', '#f59e0b');

-- Insert default functions
INSERT INTO public.team_functions (name, description) VALUES
  ('SDR', 'Sales Development Representative - Prospecção'),
  ('Closer', 'Fechador de vendas'),
  ('CS', 'Customer Success - Sucesso do cliente'),
  ('Suporte Técnico', 'Atendimento técnico especializado'),
  ('Analista de Marketing', 'Análise e estratégias de marketing');

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.teams;
ALTER PUBLICATION supabase_realtime ADD TABLE public.team_functions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.team_members;